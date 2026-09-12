'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInView } from '@/lib/useInView';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useTicker } from '@/lib/useTicker';
import { useTranslations } from '@/lib/i18n';
import styles from './FieldLifecycle.module.css';

const TOTAL_ROWS = 4000;
const CHUNK = 200;

type Act = 0 | 1 | 2 | 3;

type LogLine = { id: number; event: string; detail: string };

let lineId = 0;
const line = (event: string, detail: string): LogLine => ({ id: lineId++, event, detail });

export default function FieldLifecycle() {
  const [ref, visible] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const t = useTranslations('landing');

  const acts = useMemo(
    () => [
      {
        title: t('fieldLifecycle.acts.act0Title'),
        actor: t('fieldLifecycle.acts.act0Actor'),
        blurb: t('fieldLifecycle.acts.act0Blurb'),
      },
      {
        title: t('fieldLifecycle.acts.act1Title'),
        actor: t('fieldLifecycle.acts.act1Actor'),
        blurb: t('fieldLifecycle.acts.act1Blurb'),
      },
      {
        title: t('fieldLifecycle.acts.act2Title'),
        actor: t('fieldLifecycle.acts.act2Actor'),
        blurb: t('fieldLifecycle.acts.act2Blurb'),
      },
      {
        title: t('fieldLifecycle.acts.act3Title'),
        actor: t('fieldLifecycle.acts.act3Actor'),
        blurb: t('fieldLifecycle.acts.act3Blurb'),
      },
    ],
    [t],
  );

  const [act, setAct] = useState<Act>(0);
  const [cursor, setCursor] = useState(0);
  const [log, setLog] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const started = useRef(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  const push = useCallback((...lines: LogLine[]) => {
    setLog(prev => [...prev, ...lines].slice(-40));
  }, []);

  const goto = useCallback(
    (next: Act) => {
      setAct(next);
      if (next === 0) {
        setCursor(0);
        setLog([line('retype_started', 'field_id=17 target=int filterable=true')]);
      } else if (next === 1) {
        setCursor(0);
        push(
          line('poll_started', 'source=watcher'),
          line('provision_started', 'reason=unmapped_filterable_field'),
          line('page_provisioned', 'page_id=2 filterable_slots=i_str_01,…,i_dt_04'),
          line('provision_complete', 'source=watcher pages_added=1'),
        );
      } else if (next === 2) {
        push(
          line('slot_reserved', 'source=reconciler field_id=17 slot=i_int_01 status=backfilling'),
          line('chunk_claimed', 'source=reconciler queue=retype_backfill field_id=17'),
        );
      } else if (next === 3) {
        setCursor(TOTAL_ROWS);
        push(
          line(
            'chunk_complete',
            `queue=retype_backfill field_id=17 rows_processed=${CHUNK} final_chunk=true`,
          ),
          line('promote_to_ready', 'field_id=17 slot=i_int_01 status=ready'),
        );
      }
    },
    [push],
  );

  const start = useCallback(() => {
    started.current = true;
    setRunning(true);
    goto(0);
  }, [goto]);

  // Autoplay once, on first sight. Reduced motion gets the finished state
  // rather than a stuttering one — the end state is the actual lesson.
  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;
    if (reduced) {
      setLog([line('promote_to_ready', 'field_id=17 slot=i_int_01 status=ready')]);
      setAct(3);
      setCursor(TOTAL_ROWS);
      return;
    }
    const timer = setTimeout(start, 400);
    return () => clearTimeout(timer);
  }, [visible, reduced, start]);

  // Act 1 and 2 are held long enough to read; act 3 is paced by the chunks.
  useEffect(() => {
    if (!running || reduced) return;
    if (act === 0) {
      const timer = setTimeout(() => goto(1), 2800);
      return () => clearTimeout(timer);
    }
    if (act === 1) {
      const timer = setTimeout(() => goto(2), 2200);
      return () => clearTimeout(timer);
    }
    if (act === 3) setRunning(false);
  }, [act, running, reduced, goto]);

  // The updater stays pure — it only advances the cursor. Everything that
  // reacts to the cursor (logging a chunk, promoting the slot) happens in the
  // effect below, so nothing fires twice under StrictMode.
  useTicker(running && act === 2 && !reduced, 150, () => {
    setCursor(prev => Math.min(TOTAL_ROWS, prev + CHUNK));
  });

  useEffect(() => {
    if (act !== 2 || cursor === 0) return;
    if (cursor >= TOTAL_ROWS) goto(3);
    else
      push(
        line(
          'chunk_complete',
          `queue=retype_backfill field_id=17 rows_processed=${CHUNK} final_chunk=false`,
        ),
      );
  }, [cursor, act, goto, push]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const indexed = act === 3;
  const slotStatus = act <= 1 ? null : act === 3 ? 'ready' : 'backfilling';
  const pct = Math.round((cursor / TOTAL_ROWS) * 100);

  const readout = useMemo(
    () => [
      {
        label: 'isFilterable',
        value: 'true',
        tone: 'accent' as const,
        note: t('fieldLifecycle.readout.filterableNote'),
      },
      {
        label: 'isIndexed',
        value: indexed ? 'true' : 'false',
        tone: indexed ? ('indexed' as const) : ('pending' as const),
        note: indexed
          ? t('fieldLifecycle.readout.indexedNoteTrue')
          : t('fieldLifecycle.readout.indexedNoteFalse'),
      },
    ],
    [indexed, t],
  );

  return (
    <div className={styles.demo} ref={ref}>
      <div className={styles.timeline}>
        {acts.map((a, i) => (
          <button
            key={a.title}
            type="button"
            className={`${styles.step} ${act === i ? styles.stepOn : ''} ${act > i ? styles.stepDone : ''}`}
            onClick={() => {
              setRunning(false);
              goto(i as Act);
              if (i === 2) setCursor(Math.round(TOTAL_ROWS * 0.4));
            }}
          >
            <span className={styles.stepIndex}>{i + 1}</span>
            <span className={styles.stepText}>
              <strong>{a.title}</strong>
              <em>{a.actor}</em>
            </span>
          </button>
        ))}
      </div>

      <p className={styles.blurb}>{acts[act].blurb}</p>

      <p className={styles.caveat}>
        {t('fieldLifecycle.caveat1')}
        <code>promoteFieldToFilterable()</code>
        {t('fieldLifecycle.caveat2')}
        <code>backfilling</code>
        {t('fieldLifecycle.caveat3')}
        <code>backfilling</code>
        {t('fieldLifecycle.caveat4')}
      </p>

      <div className={styles.grid}>
        <div className={`panel ${styles.state}`}>
          <div className="panel-head">
            <span>describeModel(1, 42) → field &quot;employees&quot;</span>
          </div>

          <div className={styles.stateBody}>
            {readout.map(r => (
              <div key={r.label} className={styles.readRow}>
                <span className={styles.readLabel}>{r.label}</span>
                <span className={`tag tag-${r.tone}`}>
                  <span className="dot" />
                  {r.value}
                </span>
                <span className={styles.readNote}>{r.note}</span>
              </div>
            ))}

            <div className={styles.divider} />

            <div className={styles.readRow}>
              <span className={styles.readLabel}>{t('fieldLifecycle.readout.slotLabel')}</span>
              {slotStatus ? (
                <span className={`tag ${slotStatus === 'ready' ? 'tag-indexed' : 'tag-pending'}`}>
                  <span className="dot" />
                  i_int_01 · {slotStatus}
                </span>
              ) : (
                <span className="tag tag-error">
                  <span className="dot" />
                  {t('fieldLifecycle.readout.noneReserved')}
                </span>
              )}
              <span className={styles.readNote}>
                {slotStatus === 'ready'
                  ? t('fieldLifecycle.readout.noteReady')
                  : slotStatus
                    ? t('fieldLifecycle.readout.noteReserved')
                    : act === 1
                      ? t('fieldLifecycle.readout.noteCapacityExists')
                      : t('fieldLifecycle.readout.noteNoSlot')}
              </span>
            </div>

            <div className={styles.progressBlock}>
              <div className={styles.progressTop}>
                <span className={styles.readLabel}>backfill_checkpoints · retype_field_17</span>
                <span className={styles.cursorValue}>
                  {cursor.toLocaleString('en-US')} / {TOTAL_ROWS.toLocaleString('en-US')}
                </span>
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={`${styles.progressFill} ${indexed ? styles.progressDone : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={styles.progressNote}>
                {t('fieldLifecycle.readout.progressNote', { chunk: CHUNK })}
              </span>
            </div>
          </div>
        </div>

        <div className={`panel ${styles.logPanel}`}>
          <div className="panel-head">
            <span>{t('fieldLifecycle.logHead')}</span>
            <span className="tag tag-json">stdout</span>
          </div>
          <div className={styles.log} ref={logRef}>
            {log.map(l => (
              <div key={l.id} className={styles.logLine}>
                <span className={styles.logBrace}>{'{'}</span>
                <span className={styles.logKey}>&quot;event&quot;</span>
                <span className={styles.logBrace}>:</span>
                <span className={styles.logEvent}>&quot;{l.event}&quot;</span>
                <span className={styles.logBrace}>,</span>
                <span className={styles.logDetail}>{l.detail}</span>
                <span className={styles.logBrace}>{'}'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`panel ${styles.callPanel} ${indexed ? styles.callOk : styles.callBad}`}>
        <div className="panel-head">
          <span>{t('fieldLifecycle.callHead')}</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              started.current = true;
              start();
            }}
          >
            {t('fieldLifecycle.replayButton')}
          </button>
        </div>

        <div className={styles.callBody}>
          <pre className={styles.callCode}>
{`$engine->read(new EntryQuery(
    tenantId: 1, modelId: 42,
    filter: LeafNode::local('employees', 'gt', 100),
));`}
          </pre>

          <div className={styles.callResult}>
            {indexed ? (
              <>
                <span className="tag tag-indexed">
                  <span className="dot" />
                  {t('fieldLifecycle.resultOkTag')}
                </span>
                <p>{t('fieldLifecycle.resultOkBody')}</p>
              </>
            ) : (
              <>
                <span className="tag tag-error">
                  <span className="dot" />
                  {t('fieldLifecycle.resultErrTag')}
                </span>
                <p>{t('fieldLifecycle.resultErrBody')}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
