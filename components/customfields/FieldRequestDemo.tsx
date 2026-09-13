'use client';

import { useReducer, useState } from 'react';
import CodeBlock from '@/components/CodeBlock';
import EventLog from '@/components/playground/EventLog';
import { useLocale, useTranslations, withLocale } from '@/lib/i18n';
import { toQuery } from '@/lib/sim/link';
import { promoteFieldSnippet } from '@/lib/sim/php';
import { reduce } from '@/lib/sim/reduce';
import { PLAN } from '@/lib/sim/script';
import { SCENARIOS, type Scenario } from '@/lib/sim/scenarios';
import { emptyWorld, fieldIndexState, type FieldIndexState } from '@/lib/sim/world';
import styles from './FieldRequestDemo.module.css';

/**
 * Resolved through an IIFE, not a bare `find()` + guard, so `SCENARIO`'s
 * *type* is `Scenario` rather than `Scenario | undefined` — a control-flow
 * narrowing at module scope does not reliably carry into the component
 * closure defined below it, and this sidesteps the question rather than
 * relying on it.
 */
const SCENARIO: Scenario = (() => {
  const found = SCENARIOS.find(s => s.id === 'tenant-field-request');
  if (found === undefined) {
    throw new Error('tenant-field-request scenario missing from SCENARIOS');
  }
  return found;
})();

/** `evolve.statusLabels` and `FieldIndexState` share a key set by construction. */
const STATUS_ORDER: FieldIndexState[] = ['none', 'building', 'live'];

/**
 * Section 05 of `/custom-fields/` — the one live piece of the page.
 *
 * Everywhere else on this page is prose, real PHP, and CSS. Here alone the
 * real reducer runs, because the thing this section teaches — a promise the
 * daemons keep on their own schedule, not an instant — cannot be told with a
 * static diagram; a visitor has to press through the wait itself.
 *
 * The world is seeded straight from `SCENARIOS`, the same registry
 * `verify:scenarios` folds and asserts on every run, so this section is
 * checked by the same script that checks the playground's own picker rather
 * than by a second, hand-maintained script. Each press replays exactly one
 * `PayoffStage`'s actions and advances a local step counter — never the
 * scenario's own tick-driven clock, and never `persist.save()`, which would
 * silently overwrite whatever the visitor already built at `/playground/`.
 */
export default function FieldRequestDemo() {
  const t = useTranslations('custom-fields');
  const locale = useLocale();
  const [world, dispatch] = useReducer(
    reduce,
    undefined,
    () => reduce(emptyWorld(), { type: 'scenario/load', id: 'tenant-field-request' }),
  );
  const [stepIndex, setStepIndex] = useState(0);

  const status = fieldIndexState(world, PLAN);
  const done = stepIndex >= SCENARIO.payoff.length;
  const run = world.queryDraft.lastRun;

  function press() {
    const stage = SCENARIO?.payoff[stepIndex];
    if (stage === undefined) return;
    stage.actions.forEach(dispatch);
    setStepIndex(i => i + 1);
  }

  const playgroundHref = `${withLocale(locale, '/playground/')}${toQuery({
    scenario: 'tenant-field-request',
    models: [],
    step: null,
  })}`;

  return (
    <div className={styles.demo}>
      <div className={styles.stepper} role="group" aria-label="promotion status">
        {STATUS_ORDER.map(s => (
          <span
            key={s}
            className={`${styles.pill} ${s === status ? styles.pillActive : ''}`}
            data-status={s}
          >
            {t(`evolve.statusLabels.${s}`)}
          </span>
        ))}
      </div>

      <div className={styles.narration}>
        {done ? (
          <p>{t('evolve.done')}</p>
        ) : (
          <p>{t(`evolve.steps.${stepIndex}.body`)}</p>
        )}

        {run !== null && (
          <p className={styles.result}>
            {run.rejection !== null
              ? t('evolve.resultRefused', { code: run.rejection.errorCode })
              : t('evolve.resultMatched', { count: run.outcome?.matchedCount ?? 0 })}
          </p>
        )}

        {done ? (
          <a className="btn" href={playgroundHref}>
            {t('evolve.playgroundLink')}
          </a>
        ) : (
          <button type="button" className="btn btn-primary" onClick={press}>
            {t(`evolve.steps.${stepIndex}.button`)}
          </button>
        )}
      </div>

      <div className={styles.grid}>
        <CodeBlock
          code={promoteFieldSnippet(1, PLAN, 'plan')}
          lang="php"
          title={t('evolve.codeTitle')}
        />
        <EventLog
          events={world.events}
          title={t('evolve.eventLogTitle')}
          empty={t('evolve.eventLogEmpty')}
          height="220px"
        />
      </div>
    </div>
  );
}
