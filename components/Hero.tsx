'use client';

import { useState } from 'react';
import HeroProof from './HeroProof';
import HeroStage from './HeroStage';
import { REPO } from '@/lib/links';
import { useTranslations } from '@/lib/i18n';
import type { HeroStage as HeroStageData } from '@/lib/hero/stage';
import styles from './Hero.module.css';

const INSTALL = 'composer require damarbob/stardust:^0.3@alpha';

export default function Hero({ stage }: { stage: HeroStageData }) {
  const t = useTranslations('landing');
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState(0);

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* selectable regardless */
    }
  };

  return (
    <section className={styles.hero} id="top">
      <div className={`shell ${styles.top}`}>
        <div className={styles.copy}>
          <h1 className={styles.title}>
            <span className={styles.lead}>{t('hero.titleLine1')}</span>{' '}
            <span>{t('hero.titleLine2')}</span>
          </h1>

          <p className={styles.lede}>{t('hero.lede')}</p>

          <div className={styles.actions}>
            <button type="button" className={styles.install} onClick={copyInstall}>
              <span className={styles.prompt}>$</span>
              <code>{INSTALL}</code>
              <span className={styles.copyHint}>{copied ? t('hero.copied') : t('hero.copy')}</span>
            </button>

            <a className={styles.source} href={REPO} target="_blank" rel="noreferrer">
              {t('hero.readSource')} ↗
            </a>
          </div>
        </div>

        <div className={styles.filters} role="group" aria-label={t('hero.filtersLabel')}>
          <p className={styles.filtersLabel} aria-hidden="true">
            {t('hero.filtersLabel')}
          </p>
          {stage.presets.map((preset, i) => (
            <button
              key={preset.id}
              type="button"
              className={`${styles.filter} ${i === active ? styles.filterOn : ''} ${
                preset.rejection ? styles.filterRefused : ''
              }`}
              aria-pressed={i === active}
              onClick={() => setActive(i)}
            >
              <span className={styles.marker} aria-hidden="true" />
              <code>{preset.label}</code>
            </button>
          ))}
        </div>
      </div>

      <HeroStage
        data={stage}
        active={active}
        label={t('hero.stageLabel', { total: stage.total })}
        axisLabel={t('hero.axisLabel')}
      />

      <HeroProof stage={stage} active={active} />
    </section>
  );
}
