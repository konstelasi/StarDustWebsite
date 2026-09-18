/**
 * What a daemon did on its last poll, so a card can say so.
 *
 * **None of this is a table.** It is a record of the most recent tick, kept on
 * the world because the event log is capped and a daemon that last ran two
 * hundred lines ago would otherwise have nothing to show. The rule the roadmap
 * sets for members of `SimWorld` with no column behind them applies: it must
 * never be rendered as a row in the table inspector, and it is deliberately not
 * part of any `CREATE TABLE` in `ddl.ts`.
 *
 * The one thing here with a real analogue is `worker`: the engine's multi-worker
 * daemons mint a `host:pid:uuid` identity, and `stardust_import_jobs`,
 * `stardust_export_jobs`, and every Liberator event since ADR 0049 persist it
 * in a `worker_identity` column or field. The sync-queue drain does not — its
 * workers coordinate purely through row locks, so nothing about who claimed
 * what is written down anywhere. These labels are the simulation making that
 * visible, not a column being mirrored.
 */

import type { DaemonName } from '../clock';

/**
 * The Reconciler's own control-flow outcome — internal to `reconciler.ts`, and
 * not part of the shared `WorkerLine` shape below.
 *
 * The engine has a fourth, `LOCK_WAIT`: InnoDB refused the chunk over a lock,
 * the bounded retry budget is spent, and the source rolls back and returns
 * rather than letting the exception kill the daemon. It is absent here because
 * nothing in a browser contends for a *row*, and manufacturing a deadlock to
 * have something to draw would be theatre — an invented failure in the one
 * panel whose claim is that these are the engine's outcomes.
 *
 * That reasoning is deliberately narrower than it used to read. It rules out
 * row-level contention, which is what `LOCK_WAIT` is. It says nothing about
 * page-level contention, which the Liberator now simulates (see
 * `../daemons/liberator.ts`): a worker finding a batched page already held by
 * another worker invents no failure — nothing rolls back, nothing is
 * fabricated, no data changes — it is closer to a scheduling fact a multi-
 * worker daemon must decide than to a manufactured error. `TickOutcome` stays
 * the Reconciler's own vocabulary for exactly that reason; the Liberator's
 * claimed/contended distinction never needed to join it.
 */
export type TickOutcome = 'work_done' | 'idle' | 'capacity_wait';

/**
 * The Reconciler's work sources, in the engine's round-robin order.
 *
 * The engine runs six and the order is observable in an event stream, so its
 * rule is **new sources append, never insert**. That rule is about *its* list,
 * which this one mirrors — so what matters is the **index**, not the end. The
 * import-job drain is source 2 and belongs to the operations section; when it
 * lands it goes *between* `sync_queue` and `retype_backfill`, not after them.
 */
export type WorkSourceName =
  | 'sync_queue'
  | 'retype_backfill'
  | 'rename_backfill'
  | 'delete_purge'
  | 'model_delete_purge';

/**
 * What the worker strip draws — not an engine outcome. Those (the Reconciler's
 * `TickOutcome`, the Liberator's own claimed/contended tally) stay inside each
 * daemon, because they mean different things: `capacity_wait` is meaningless to
 * the Liberator, and "this page is held by another worker" is meaningless to
 * the Reconciler. `WorkerState` is the one three-way shape both daemons reduce
 * to, purely for rendering.
 */
export type WorkerState = 'working' | 'idle' | 'blocked';

/**
 * One worker's line for one tick, shared by every multi-worker daemon.
 *
 * Deliberately minimal, and deliberately not `WorkerClaim` (the name it
 * replaced): a contended or capacity-starved worker claimed nothing, so
 * "claim" was the wrong word for half of what this type expressed. Each
 * daemon keeps its own structured internal record — the Reconciler mutates a
 * claim across five possible sources, the Liberator tallies claimed and
 * contended slots per page — and converts to this shape exactly once, at the
 * point its tick builds a `DaemonActivity`. `note?: 'reserved_and_rolled_back'`
 * does not survive that conversion: it existed solely to pick a message, and
 * under this shape it *is* one, chosen where the fact is known.
 */
export interface WorkerLine {
  /** `w1` … `w3`, standing in for the engine's `host:pid:uuid`. */
  worker: string;
  state: WorkerState;
  /** Written by the daemon, rendered by the component — see below. */
  detail: DaemonActivityMessage;
}

/**
 * A translation key into `playground.json`'s `daemonRoom.activity` namespace,
 * plus the params it interpolates.
 *
 * A key-and-params pair rather than a rendered string, for the same reason
 * `notify.ts`'s `Say` type is: this file is pure and has no locale to ask, so
 * rendering has to wait for a component that does. `DaemonCard` is the only
 * reader of `action`; `WorkerStrip` is the only reader of a `WorkerLine`'s
 * `detail` — same contract, same reason.
 */
export interface DaemonActivityMessage {
  key: string;
  params?: Record<string, string | number>;
}

export interface DaemonActivity {
  /** The tick this describes. Compared against `clock.tick` for the pulse. */
  tick: number;
  /** One line for the card. Written by the daemon, not by the component. */
  action: DaemonActivityMessage;
  /**
   * Any multi-worker daemon — one entry per worker for its last tick,
   * including a worker that found or claimed nothing. Not Reconciler-only:
   * the Liberator writes this shape too, since ADR 0049.
   */
  workers?: WorkerLine[];
}

/**
 * Deliberately `Partial`, not a total `Record`.
 *
 * `persist.ts` restores top-level members wholesale, so a stored world written
 * before a daemon existed would come back missing that key. Typing it partial
 * makes every consumer handle the absence, which is the same hazard `seq` had
 * to solve with a nested merge — solved here at the type level instead.
 */
export type DaemonActivityMap = Partial<Record<DaemonName, DaemonActivity>>;
