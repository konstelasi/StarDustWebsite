'use client';

import { useCallback, useState } from 'react';
import { useInView } from '@/lib/useInView';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useTicker } from '@/lib/useTicker';
import { useTranslations } from '@/lib/i18n';
import styles from './DaemonBoard.module.css';

/**
 * What one provisioned page adds, and the level that triggers the next one.
 *
 * Sixteen because a page is created with exactly the columns it indexes, four
 * of every type family — it is not sixty columns of which a few are usable. The
 * trigger is 20% of that, which is the engine's own capacity threshold, so the
 * gauge swings through the same proportions it always did; the cycle is simply
 * four times shorter, and the Watcher lights up more than once a visit.
 */
const SLOTS_PER_PAGE = 16;
const LOW_CAPACITY = 3;
const WORKERS = 3;

type Tombstone = { id: number; column: string; swept: number };

type Board = {
  tick: number;
  pages: number;
  freeSlots: number;
  queue: number[];
  claims: (number | null)[];
  drained: number;
  tombstones: Tombstone[];
  reclaimed: number;
  exportPct: number;
  artifacts: number;
  entries: number;
  nextEntryId: number;
  nextTombstoneId: number;
  active: Record<string, number>;
};

const INITIAL: Board = {
  tick: 0,
  pages: 1,
  freeSlots: 5,
  queue: [8801, 8802, 8803, 8804, 8805],
  claims: [null, null, null],
  drained: 0,
  tombstones: [{ id: 1, column: 'i_str_04', swept: 0 }],
  reclaimed: 0,
  exportPct: 0,
  artifacts: 0,
  entries: 128_400,
  nextEntryId: 8806,
  nextTombstoneId: 2,
  active: {},
};

/**
 * One tick of the whole board.
 *
 * Each daemon runs on its own period, and none of them reads another's
 * state — every interaction between them goes through the shared counters,
 * which is the point the diagram is making. The Liberator returning slots to
 * `free` is what keeps the Watcher from provisioning another page; the two
 * have no idea the other exists.
 */
function step(b: Board): Board {
  const tick = b.tick + 1;
  const next: Board = { ...b, tick, active: {}, claims: [...b.claims], queue: [...b.queue] };

  // Application writes keep arriving. This is not a daemon.
  if (tick % 3 === 0) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) next.queue.push(next.nextEntryId + i);
    next.nextEntryId += n;
    next.entries += n;
  }

  // Reconciler — multi-worker, claims under FOR UPDATE SKIP LOCKED.
  if (tick % 2 === 0) {
    next.claims = next.claims.map(c => {
      if (c !== null) {
        next.drained += 1;
        next.freeSlots = Math.max(0, next.freeSlots - (Math.random() < 0.35 ? 1 : 0));
        return null;
      }
      return next.queue.shift() ?? null;
    });
    if (next.claims.some(c => c !== null) || next.drained !== b.drained) next.active.reconciler = tick;
  }

  // Watcher — singleton, provisions when capacity runs low.
  if (tick % 4 === 0 && next.freeSlots <= LOW_CAPACITY) {
    next.pages += 1;
    next.freeSlots += SLOTS_PER_PAGE;
    next.active.watcher = tick;
  }

  // Liberator — multi-worker, sweeps tombstoned slots back to free in chunks.
  if (tick % 2 === 1 && next.tombstones.length > 0) {
    next.tombstones = next.tombstones
      .map((t, i) => (i === 0 ? { ...t, swept: Math.min(100, t.swept + 34) } : t))
      .filter(t => {
        if (t.swept >= 100) {
          next.reclaimed += 1;
          next.freeSlots += 1;
          return false;
        }
        return true;
      });
    next.active.liberator = tick;
  }

  // A field gets demoted now and then, which is where tombstones come from.
  if (tick % 11 === 0) {
    const cols = ['i_str_02', 'i_int_03', 'i_num_01', 'i_dt_02'];
    next.tombstones = [
      ...next.tombstones,
      { id: next.nextTombstoneId, column: cols[next.nextTombstoneId % cols.length], swept: 0 },
    ];
    next.nextTombstoneId += 1;
  }

  // Chronicler — multi-worker, streams an export artifact to disk.
  next.exportPct += 9 + Math.floor(Math.random() * 8);
  if (next.exportPct >= 100) {
    next.exportPct = 0;
    next.artifacts += 1;
  }
  next.active.chronicler = tick;

  return next;
}

function Daemon({
  name,
  kind,
  role,
  live,
  children,
  side,
}: {
  name: string;
  kind: string;
  role: string;
  live: boolean;
  children: React.ReactNode;
  side: 'top' | 'bottom';
}) {
  return (
    <div className={`panel ${styles.daemon} ${live ? styles.daemonLive : ''} ${styles[side]}`}>
      <div className="panel-head">
        <span className={styles.daemonName}>
          <span className={`${styles.pulse} ${live ? styles.pulseOn : ''}`} />
          {name}
        </span>
        <span className="tag">{kind}</span>
      </div>
      <div className={styles.daemonBody}>
        <p className={styles.role}>{role}</p>
        {children}
      </div>
      <span className={`${styles.wire} ${live ? styles.wireLive : ''}`} aria-hidden="true" />
    </div>
  );
}

export default function DaemonBoard() {
  const [ref, visible] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const t = useTranslations('landing');
  const [board, setBoard] = useState<Board>(INITIAL);
  const [paused, setPaused] = useState(false);

  const advance = useCallback(() => setBoard(step), []);

  // Under reduced motion the ticker never starts, so the board holds its
  // seeded mid-run state — a stroboscopic counter helps nobody.

  useTicker(visible && !paused && !reduced, 900, advance);

  const isLive = (key: string) => board.active[key] === board.tick;

  return (
    <div className={styles.board} ref={ref}>
      <div className={styles.controls}>
        <button type="button" className="btn" onClick={() => setPaused(p => !p)} disabled={reduced}>
          {paused ? t('daemonBoard.resume') : t('daemonBoard.pause')}
        </button>
        <span className={styles.tickLabel}>{t('daemonBoard.tickLabel', { count: board.tick })}</span>
        <span className={styles.legend}>{t('daemonBoard.legend')}</span>
      </div>

      <div className={styles.row}>
        <Daemon
          name="Watcher"
          kind="singleton"
          role={t('daemonBoard.watcherRole')}
          live={isLive('watcher')}
          side="top"
        >
          <div className={styles.gauge}>
            <div className={styles.gaugeTop}>
              <span>{t('daemonBoard.freeSlotsLabel')}</span>
              <strong className={board.freeSlots <= LOW_CAPACITY ? styles.low : undefined}>
                {board.freeSlots}
              </strong>
            </div>
            <div className={styles.gaugeTrack}>
              <div
                className={`${styles.gaugeFill} ${board.freeSlots <= LOW_CAPACITY ? styles.gaugeLow : ''}`}
                style={{ width: `${Math.min(100, (board.freeSlots / SLOTS_PER_PAGE) * 100)}%` }}
              />
            </div>
            <span className={styles.sub}>
              {board.pages > 1
                ? t('daemonBoard.pagesProvisionedMany', { count: board.pages })
                : t('daemonBoard.pagesProvisionedOne', { count: board.pages })}
            </span>
          </div>
        </Daemon>

        <Daemon
          name="Reconciler"
          kind="multi-worker"
          role={t('daemonBoard.reconcilerRole')}
          live={isLive('reconciler')}
          side="top"
        >
          <div className={styles.queue}>
            <span className={styles.sub}>
              {t('daemonBoard.syncQueuePending', { count: board.queue.length })}
            </span>
            <div className={styles.queueChips}>
              {board.queue.slice(0, 7).map(id => (
                <span key={id} className={styles.qchip}>
                  {id}
                </span>
              ))}
              {board.queue.length > 7 && <span className={styles.qmore}>+{board.queue.length - 7}</span>}
              {board.queue.length === 0 && <span className={styles.qempty}>{t('daemonBoard.empty')}</span>}
            </div>

            <div className={styles.workers}>
              {Array.from({ length: WORKERS }, (_, i) => (
                <span key={i} className={`${styles.worker} ${board.claims[i] !== null ? styles.workerBusy : ''}`}>
                  w{i + 1}
                  <em>
                    {board.claims[i] !== null
                      ? t('daemonBoard.workerClaimed', { id: board.claims[i] as number })
                      : t('daemonBoard.workerIdle')}
                  </em>
                </span>
              ))}
            </div>
            <span className={styles.sub}>
              {t('daemonBoard.rowsDrained', { count: board.drained.toLocaleString('en-US') })}
            </span>
          </div>
        </Daemon>
      </div>

      {/* ---------- the only thing any of them talks to ---------- */}
      <div className={styles.core}>
        <div className={styles.coreHead}>
          <span className={styles.coreTitle}>MySQL · MariaDB</span>
          <span className={styles.coreSub}>{t('daemonBoard.coreSub')}</span>
        </div>
        <div className={styles.coreTables}>
          <span className={styles.coreTable}>
            entry_data
            <em>{t('daemonBoard.entriesRows', { count: board.entries.toLocaleString('en-US') })}</em>
          </span>
          <span className={styles.coreTable}>
            entry_slots_page_1…{board.pages}
            <em>{t('daemonBoard.freeSlotsCount', { count: board.freeSlots })}</em>
          </span>
          <span className={styles.coreTable}>
            stardust_sync_queue
            <em>{t('daemonBoard.syncQueueCount', { count: board.queue.length })}</em>
          </span>
          <span className={styles.coreTable}>
            stardust_slot_assignments
            <em>{t('daemonBoard.tombstonedCount', { count: board.tombstones.length })}</em>
          </span>
          <span className={styles.coreTable}>
            stardust_export_jobs
            <em>{t('daemonBoard.artifactsComplete', { count: board.artifacts })}</em>
          </span>
        </div>
      </div>

      <div className={styles.row}>
        <Daemon
          name="Liberator"
          kind="multi-worker"
          role={t('daemonBoard.liberatorRole')}
          live={isLive('liberator')}
          side="bottom"
        >
          <div className={styles.sweep}>
            {board.tombstones.length === 0 ? (
              <span className={styles.qempty}>{t('daemonBoard.nothingTombstoned')}</span>
            ) : (
              board.tombstones.slice(0, 3).map(ts => (
                <div key={ts.id} className={styles.sweepRow}>
                  <span className={styles.sweepCol}>{ts.column}</span>
                  <div className={styles.sweepTrack}>
                    <div className={styles.sweepFill} style={{ width: `${ts.swept}%` }} />
                  </div>
                  <span className={styles.sweepPct}>{ts.swept}%</span>
                </div>
              ))
            )}
            <span className={styles.sub}>
              {t('daemonBoard.slotsReturned', { count: board.reclaimed })}
            </span>
          </div>
        </Daemon>

        <Daemon
          name="Chronicler"
          kind="multi-worker"
          role={t('daemonBoard.chroniclerRole')}
          live={isLive('chronicler')}
          side="bottom"
        >
          <div className={styles.export}>
            <div className={styles.gaugeTop}>
              <span>export_{String(board.artifacts + 1).padStart(4, '0')}.csv</span>
              <strong>{board.exportPct}%</strong>
            </div>
            <div className={styles.gaugeTrack}>
              <div className={styles.exportFill} style={{ width: `${board.exportPct}%` }} />
            </div>
            <span className={styles.sub}>
              {board.artifacts === 1
                ? t('daemonBoard.artifactsWrittenOne', { count: board.artifacts })
                : t('daemonBoard.artifactsWrittenMany', { count: board.artifacts })}
            </span>
          </div>
        </Daemon>
      </div>
    </div>
  );
}
