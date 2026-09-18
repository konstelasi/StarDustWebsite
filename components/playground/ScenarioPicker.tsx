'use client';

import { useState } from 'react';
import { useTranslations } from '@/lib/i18n';
import { SCENARIOS, type Scenario, type ScenarioId } from '@/lib/sim/scenarios';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { usePlayground } from './PlaygroundContext';
import styles from './ScenarioPicker.module.css';

/** `'promotion-window'` → `'promotionWindow'` — `scenarios.json`'s key shape. */
function scenarioKey(id: ScenarioId): string {
  return id.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

/**
 * The picker, and the strip that explains what it parked you in.
 *
 * Two exports rather than one component, because they belong on opposite sides
 * of the clock bar's `position: sticky`. The dropdown is a world control and
 * sits on the bar next to `reset world` — the control it most resembles, since
 * a scenario also replaces the world. The strip is three lines of prose and
 * would make the sticky bar tall enough to eat the screen on a phone, so it
 * renders below the bar and scrolls away with the page.
 *
 * Neither holds the loaded id: `ClockBar` owns it, so its existing reset button
 * can clear the strip in the same gesture that clears the world. What lives
 * here is `pending`, which is one dropdown's confirm state and nothing else's
 * business.
 *
 * A `<select>` rather than a row of buttons — same four presets, but a native
 * dropdown collapses to one line at any viewport width instead of depending on
 * `flex-wrap` to reflow, and it comes with a platform-native picker on a phone
 * for free. The tradeoff is the confirm gesture: a button offered "click again
 * to confirm" on the same element, but a `<select>`'s `onChange` already
 * committed the choice by the time it fires, so confirming a replacement needs
 * a second, separate control instead of a second click on the first one.
 */

export function ScenarioPicker({ onLoad }: { onLoad: (id: ScenarioId) => void }) {
  const { world, hydrated } = usePlayground();
  const [pending, setPending] = useState<ScenarioId | null>(null);
  const t = useTranslations('playground');
  const tScenarios = useTranslations('scenarios');

  // Before hydration the client renders `emptyWorld()` to match the server, so
  // reading the restored world any earlier is a mismatch. Un-hydrated therefore
  // reads as empty — which it is, on screen.
  const populated = hydrated && (world.models.length > 0 || world.entries.length > 0);

  function choose(value: string) {
    if (value === '') {
      setPending(null);
      return;
    }
    const id = value as ScenarioId;
    // A scenario replaces the world, and the visitor may have built something.
    // A populated world holds the choice pending a second, explicit control
    // rather than loading on the spot — the dropdown equivalent of the
    // buttons' old two-click arm/confirm.
    if (populated) {
      setPending(id);
      return;
    }
    onLoad(id);
  }

  function confirm() {
    if (pending === null) return;
    onLoad(pending);
    setPending(null);
  }

  const blurbKey = pending === null ? null : scenarioKey(pending);

  return (
    <div className={styles.buttons} role="group" aria-label={t('scenarioPicker.groupLabel')}>
      <label className={styles.label} htmlFor="scenario-picker">
        {t('scenarioPicker.label')}
      </label>
      <select
        id="scenario-picker"
        className={styles.select}
        value={pending ?? ''}
        onChange={e => choose(e.target.value)}
        title={blurbKey === null ? undefined : tScenarios(`scenarios.${blurbKey}.blurb`)}
      >
        <option value="">{t('scenarioPicker.placeholder')}</option>
        {SCENARIOS.map(scenario => {
          const key = scenarioKey(scenario.id);
          return (
            <option key={scenario.id} value={scenario.id}>
              {tScenarios(`scenarios.${key}.title`)}
            </option>
          );
        })}
      </select>
      {pending !== null && (
        <span className={styles.confirm}>
          {t('scenarioPicker.discardWarning')}
          <button type="button" className={styles.confirmBtn} onClick={confirm}>
            {t('scenarioPicker.replaceWorld')}
          </button>
          <button type="button" className={styles.cancelBtn} onClick={() => setPending(null)}>
            {t('scenarioPicker.cancel')}
          </button>
        </span>
      )}
    </div>
  );
}

export function ScenarioStrip({
  scenario,
  onDismiss,
}: {
  scenario: Scenario;
  onDismiss: () => void;
}) {
  const reduced = useReducedMotion();
  const t = useTranslations('playground');
  const tScenarios = useTranslations('scenarios');
  const key = scenarioKey(scenario.id);

  return (
    <div className={`panel ${styles.strip}`} role="status">
      <div className={styles.stripHead}>
        <p className="eyebrow">{t('scenarioPicker.parkedEyebrow')}</p>
        <button type="button" className={styles.dismiss} onClick={onDismiss}>
          {t('scenarioPicker.dismiss')}
        </button>
      </div>
      <div className={styles.stripBody}>
        <h3 className={styles.stripTitle}>{tScenarios(`scenarios.${key}.title`)}</h3>
        <p className={styles.parked}>{tScenarios(`scenarios.${key}.parked`)}</p>
        <p className={styles.next}>
          <strong>{t('scenarioPicker.next')}</strong>{' '}
          {/* Under reduced motion the clock cannot run itself, so an
              instruction to press run would be an instruction to press a
              disabled button. */}
          {tScenarios(`scenarios.${key}.${reduced ? 'nextStepReduced' : 'nextStep'}`)}{' '}
          <a href={scenario.anchor} className={styles.jump}>
            {t('scenarioPicker.goTo', { target: tScenarios(`scenarios.${key}.anchorLabel`) })}
          </a>
        </p>
      </div>
    </div>
  );
}
