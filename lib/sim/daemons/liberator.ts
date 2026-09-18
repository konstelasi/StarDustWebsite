/**
 * The Liberator — multi-worker slot reclamation.
 *
 * A demoted field leaves its column full of values nobody will ever read again,
 * and the slot marked `tombstoned` so nothing reserves it. The Liberator is what
 * closes that loop: it nullifies the residue chunk by chunk, then hands the slot
 * back as `free`. Without it every demotion would cost a column permanently, the
 * Watcher would keep provisioning pages to replace capacity that was never
 * actually gone, and the two daemons would never once refer to each other — the
 * whole exchange happens through one row's `status`.
 *
 * **It has no PID guard.** ADR 0049 replaced the old process singleton with
 * page-table-granularity `GET_LOCK` exclusion, taken inside the sweep itself:
 * several Liberator processes can run at once, each excluded only from the one
 * `entry_slots_page_N` another is already sweeping — throughput scales with
 * how many *pages* hold tombstones, not with how many workers are running.
 * `LIBERATOR_WORKERS = 3` run here, and the exclusion is simulated by treating
 * one tick as one simultaneity window: real workers' cycles overlap, so a page
 * one worker is sweeping is genuinely unavailable to the others for that
 * window. Each worker therefore claims **at most one page per tick** — the
 * batch's distinct pages dealt round-robin across the three — sweeps one chunk
 * of every batched slot on the page(s) it holds, and reports every other
 * batched slot as contended. This is a deliberate deviation from the engine's
 * literal per-worker loop (which walks the *whole* batch, acquiring and
 * releasing one page lock at a time) rather than a transcription of it — a
 * literal transcription in a single-threaded fold would have worker one sweep
 * every page and release each lock before worker two ever looked, making
 * contention structurally unreachable. The deviation preserves the one
 * invariant that matters: for every worker, `slots_claimed + slots_contended
 * === batch_size`, exactly as the engine's own payload always does, because
 * every distinct page in the batch is dealt to exactly one worker.
 *
 * Five details are worth keeping straight:
 *
 *   - **The sweep never joins the field table.** It keys on the page, the
 *     column and a cursor, and nothing else. That is what lets it reclaim a
 *     slot whose field row has already been deleted.
 *   - **`sweepGapCount` survives the reclaim, and page-lock contention never
 *     touches it.** It counts chunks a sweep skipped over under *deadlock*
 *     contention (ADR 0046), an operator annotation about the column rather
 *     than the field that used to hold it; the engine clears it at the next
 *     tombstone instead (ADR 0045), which `reserve.ts` mirrors. Page-lock
 *     contention is a different mechanism entirely — a worker that finds a
 *     batched page already held skips the *whole slot*, untouched, with no
 *     cursor advance and no gap recorded. Conflating the two would be a worse
 *     defect than either alone.
 *   - **There is still no *deadlock* gap path here, and its absence is still
 *     why a reclaim is unconditional.** Page-lock contention is now simulated
 *     — a worker excluded from a page simply does not sweep it this tick — but
 *     that invents no failure: nothing rolls back, nothing is fabricated, no
 *     data changes, and the slot stays `tombstoned` for whichever worker takes
 *     its page next cycle. What stays absent is the ADR 0046 *chunk-
 *     abandonment* path (three consecutive InnoDB deadlocks on the same
 *     chunk), which has no meaning in a single-threaded browser simulation, so
 *     every chunk a worker actually sweeps completes cleanly and every
 *     completed sweep reclaims. `free` still means verified empty: a
 *     contended slot was never touched, so it carries no unverified residue.
 *   - **An idle tick — the whole batch empty — emits nothing at all**, and
 *     writes no `daemonActivity` either. Not a heartbeat, not a
 *     `poll_complete`. A daemon with no work is silent, which is why its card
 *     has to read as deliberately quiet rather than broken. A tick where every
 *     worker is contended (nonempty batch, but a worker holds none of its
 *     pages) is different: that worker's own `sweep_started` is what stays
 *     silent, per the next point, but the *tick* still writes activity because
 *     at least one worker did claim something — the round-robin guarantees a
 *     nonempty batch always has an owner for every distinct page.
 *   - **`worker_identity` rides all five Liberator events**, per ADR 0049,
 *     because with N workers the event stream alone can no longer say which
 *     process emitted what; here it is `w1`…`w3`, the same stand-in used on the
 *     Reconciler's chunk events.
 */

import { correlationId, emit } from '../emit';
import { line, type SimEvent } from '../events';
import type { SimEntry, SimSlot } from '../types';
import { simNow, type SimWorld } from '../world';
import type { WorkerLine } from './types';

/** `Config::$liberatorBatchSize` — tombstoned slots picked up per tick. */
export const LIBERATOR_BATCH_SIZE = 50;

/** `Config::$liberatorChunkSize` — rows nullified per chunk transaction. */
export const LIBERATOR_CHUNK_SIZE = 500;

/** How many worker processes the playground runs. `bin/stardust liberator` ×3. */
export const LIBERATOR_WORKERS = 3;

export function liberatorTick(world: SimWorld): SimWorld {
  const batch = tombstonedBatch(world);

  // Idle ticks emit nothing, and record nothing either — a card that said
  // "swept 0 slots" every three ticks would bury the ticks that mattered.
  if (batch.length === 0) return world;

  // The round-robin unit is the *distinct page*, in the batch's own order —
  // several tombstoned slots can share one page, and they must share one
  // owner, since the engine's exclusion is page-table granularity.
  const pages: number[] = [];
  for (const slot of batch) {
    if (!pages.includes(slot.pageId)) pages.push(slot.pageId);
  }
  const ownerOf = new Map<number, number>();
  pages.forEach((pageId, k) => ownerOf.set(pageId, k % LIBERATOR_WORKERS));

  let next = world;
  let totalReclaimed = 0;
  let totalNullified = 0;
  const lines: WorkerLine[] = [];

  for (let w = 0; w < LIBERATOR_WORKERS; w++) {
    const worker = `w${w + 1}`;
    const mine = batch.filter(slot => ownerOf.get(slot.pageId) === w);

    if (mine.length === 0) {
      // Fully contended: every batched page belongs to some other worker this
      // tick. No event — the engine's own worker emits nothing when it claims
      // zero slots, extending AC#13's idle-tick silence to "nothing to do
      // because everything is already spoken for."
      lines.push({
        worker,
        state: 'blocked',
        detail: { key: 'daemonRoom.activity.liberatorWorkerBlocked' },
      });
      continue;
    }

    // One correlation id per worker per tick, standing in for one Liberator
    // *process* invocation — not one per tick overall, or two workers'
    // sweeps would be indistinguishable in a log panel whose whole point is
    // disentangling concurrent units.
    const corrId = correlationId('liberator', world.clock.tick, w);

    let workerReclaimed = 0;
    let workerNullified = 0;
    for (const slot of mine) {
      const swept = sweepOneChunk(next, slot, corrId, worker);
      next = swept.world;
      workerNullified += swept.rowsNullified;
      if (swept.reclaimed) workerReclaimed++;
    }
    totalNullified += workerNullified;
    totalReclaimed += workerReclaimed;

    // `sweep_started` fires LAST for this worker, not first — the engine's
    // Liberator::sweepBatch() does the same, because its tallies
    // (`slots_claimed` / `slots_contended`) are not knowable until the
    // worker's own share of the batch has been walked slot by slot.
    next = emit(next, (nextSeq, tick): SimEvent[] => [
      line(
        nextSeq(),
        tick,
        'liberator',
        'sweep_started',
        {
          correlation_id: corrId,
          worker_identity: worker,
          batch_size: batch.length,
          slots_claimed: mine.length,
          slots_contended: batch.length - mine.length,
        },
      ),
    ]);

    // The page a worker's message names. Every scripted world today ever
    // hands one worker at most one page — round-robin only assigns a second
    // to the same worker once a batch spans more than `LIBERATOR_WORKERS`
    // distinct pages, which nothing here produces — so naming the first is
    // never a simplification in practice, only in principle.
    const pageId = mine[0].pageId;
    lines.push({
      worker,
      state: 'working',
      detail:
        workerReclaimed > 0
          ? {
              key:
                workerReclaimed === 1
                  ? 'daemonRoom.activity.liberatorWorkerReclaimedOne'
                  : 'daemonRoom.activity.liberatorWorkerReclaimedMany',
              params: { pageId, reclaimed: workerReclaimed, nullified: workerNullified },
            }
          : {
              key:
                mine.length === 1
                  ? 'daemonRoom.activity.liberatorWorkerSweptOne'
                  : 'daemonRoom.activity.liberatorWorkerSweptMany',
              params: { pageId, slots: mine.length, nullified: workerNullified },
            },
    });
  }

  return {
    ...next,
    daemonActivity: {
      ...next.daemonActivity,
      liberator: {
        tick: world.clock.tick,
        // The tick-level aggregate across every worker — unchanged in meaning
        // from before this file went multi-worker, and byte-identical to what
        // the old single-loop code computed whenever the batch spans exactly
        // one page (every scenario up to and including `warm-path`).
        action:
          totalReclaimed > 0
            ? {
                key:
                  totalReclaimed === 1
                    ? 'daemonRoom.activity.liberatorReclaimedOne'
                    : 'daemonRoom.activity.liberatorReclaimedMany',
                params: { nullified: totalNullified, reclaimed: totalReclaimed },
              }
            : {
                key:
                  batch.length === 1
                    ? 'daemonRoom.activity.liberatorSweptOne'
                    : 'daemonRoom.activity.liberatorSweptMany',
                params: { nullified: totalNullified, batchSize: batch.length },
              },
        workers: lines,
      },
    },
  };
}

/**
 * How far one slot's sweep has got, as rows rather than ids.
 *
 * Both numbers are counted the same way {@link sweepOneChunk} counts its
 * population — off the *page table*, not off `entry_data` — or the bar and the
 * sweep disagree about what "done" means.
 *
 * `sweepCursorId` is an entry **id**, not a count, and the two are only equal
 * when every entry has a row on the page. Dividing the cursor by a row count
 * reads as 5000% on a page holding ten rows out of six hundred entries, which
 * is exactly the shape of mistake this helper exists to make impossible.
 */
export function sweepProgress(
  world: SimWorld,
  pageId: number,
  cursor: number,
): { swept: number; total: number } {
  const rows = world.entries.filter(e => e.slots[pageId] !== undefined);
  return { swept: rows.filter(e => e.id <= cursor).length, total: rows.length };
}

/**
 * `TombstonedSlotRepository::loadBatch()`.
 *
 * Oldest tombstone first, then page and column — a stable order with no `FOR
 * UPDATE`. The engine needs none even though the Liberator is multi-worker
 * (ADR 0049): two workers loading the same batch is fine and costs one extra
 * SELECT per cycle, because exclusion happens afterwards, at page-table
 * granularity, via `SweepPageLock` — not here.
 */
export function tombstonedBatch(world: SimWorld): SimSlot[] {
  return world.slots
    .filter(s => s.status === 'tombstoned')
    .sort(
      (a, b) =>
        (a.tombstonedAt ?? '').localeCompare(b.tombstonedAt ?? '') ||
        a.pageId - b.pageId ||
        a.slotColumn.localeCompare(b.slotColumn),
    )
    .slice(0, LIBERATOR_BATCH_SIZE);
}

/**
 * One chunk of one slot's sweep, in one transaction.
 *
 * Select the next `chunkSize` page rows past the cursor, null the column on all
 * of them, advance the cursor. When the select comes back short the page is
 * exhausted, and the *same* transaction flips the slot to `free` and bumps the
 * schema version — the reclaim and the version move together or a reserver
 * could claim a slot whose residue is still there.
 */
function sweepOneChunk(
  world: SimWorld,
  slot: SimSlot,
  corrId: string,
  worker: string,
): { world: SimWorld; rowsNullified: number; reclaimed: boolean } {
  const cursor = slot.sweepCursorId ?? 0;

  // **The population is the page table, not `entry_data`.** The engine runs
  // `SELECT entry_id FROM entry_slots_page_N WHERE entry_id > ? LIMIT ?`, and
  // that table has a row only for an entry that has ever had a value written
  // on this page — an entry whose model lives entirely on another page is
  // simply not there.
  //
  // Sweeping every entry instead is the natural shortcut and it is wrong in two
  // visible ways: `rows_nullified` overcounts, and the cursor walks past ids
  // with no row, so a sweep of a page holding two rows reports two full chunks.
  // A NULL that is already NULL does still count — the engine nulls
  // unconditionally — but only for rows that exist.
  const candidates = world.entries
    .filter(e => e.id > cursor && e.slots[slot.pageId] !== undefined)
    .sort((a, b) => a.id - b.id)
    .slice(0, LIBERATOR_CHUNK_SIZE);

  const isFinalChunk = candidates.length < LIBERATOR_CHUNK_SIZE;
  const newCursor = candidates.length > 0 ? candidates[candidates.length - 1].id : cursor;
  const now = simNow(world);

  const swept = new Set(candidates.map(e => e.id));
  const entries: SimEntry[] = world.entries.map(entry => {
    if (!swept.has(entry.id)) return entry;
    const page = entry.slots[slot.pageId];
    if (page === undefined || !(slot.slotColumn in page)) return entry;
    const columns = { ...page };
    delete columns[slot.slotColumn];
    return { ...entry, slots: { ...entry.slots, [slot.pageId]: columns } };
  });

  const next: SimWorld = {
    ...world,
    entries,
    slots: world.slots.map(s =>
      s.id !== slot.id
        ? s
        : {
            ...s,
            sweepCursorId: newCursor,
            updatedAt: now,
            ...(isFinalChunk
              ? { status: 'free' as const, fieldId: null, tombstonedAt: null }
              : {}),
          },
    ),
    ...(isFinalChunk
      ? { schemaVersion: world.schemaVersion + 1, schemaVersionUpdatedAt: now }
      : {}),
  };

  return {
    world: emit(next, (nextSeq, tick): SimEvent[] => {
      const lines = [
        line(
          nextSeq(),
          tick,
          'liberator',
          'sweep_chunk',
          {
            correlation_id: corrId,
            worker_identity: worker,
            slot_assignment_id: slot.id,
            rows_nullified: candidates.length,
            sweep_cursor_id: newCursor,
          },
        ),
      ];
      if (isFinalChunk) {
        lines.push(
          line(
            nextSeq(),
            tick,
            'liberator',
            'sweep_complete',
            {
              correlation_id: corrId,
              worker_identity: worker,
              slot_assignment_id: slot.id,
              sweep_cursor_id: newCursor,
            },
          ),
        );
      }
      return lines;
    }),
    rowsNullified: candidates.length,
    reclaimed: isFinalChunk,
  };
}
