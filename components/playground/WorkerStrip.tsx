'use client';

import { useTranslations } from '@/lib/i18n';
import type { WorkerLine } from '@/lib/sim/daemons/types';
import styles from './WorkerStrip.module.css';

type Props = {
  /** Every worker's line for the daemon's last tick, in worker order. */
  lines: WorkerLine[];
  /**
   * The strip's accessible name.
   *
   * Required, not optional: with two strips now rendering on one page — the
   * Reconciler's and the Liberator's — a bare unlabelled list reads
   * identically to a screen-reader user, and the label is what tells them
   * apart. There was nothing to confuse it with while only one strip existed.
   */
  label: string;
};

/**
 * One multi-worker daemon's per-tick lines, rendered as a list.
 *
 * Extracted from `DaemonRoom.tsx`'s reconciler-only worker markup the moment
 * the Liberator needed the identical shape — see `lib/sim/daemons/types.ts`'s
 * `WorkerLine`, which both daemons now write. The strip is **total** over
 * that type: it renders `t(line.detail.key, line.detail.params)` and nothing
 * about either daemon's own vocabulary (`WorkSourceName`, page ids,
 * `TickOutcome`) reaches this file. That is what keeps a third multi-worker
 * daemon (the Chronicler, eventually) from costing this component a line —
 * the same reasoning as `TableView.tsx`'s `ROW_CLASS` export: a caller must
 * not have to reach into another component's CSS module, so this one owns its
 * markup and its classes outright rather than being handed them.
 *
 * Deliberately no `aria-live`: the strip churns every tick while the clock
 * runs, and announcing that continuously would be hostile rather than
 * helpful. The silence here is a decision, not an oversight.
 */
export default function WorkerStrip({ lines, label }: Props) {
  const t = useTranslations('playground');

  return (
    <ul className={styles.workers} aria-label={label}>
      {lines.map(line => (
        <li
          key={line.worker}
          className={`${styles.worker} ${line.state === 'working' ? styles.workerBusy : ''}`}
        >
          <span className={styles.workerName}>{line.worker}</span>
          <em
            className={
              line.state === 'blocked' ? styles.blocked : line.state === 'idle' ? styles.idle : undefined
            }
          >
            {t(line.detail.key, line.detail.params)}
          </em>
        </li>
      ))}
    </ul>
  );
}
