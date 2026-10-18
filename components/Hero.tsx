'use client';

import { useState } from 'react';
import CodeBlock from './CodeBlock';
import Starfield from './Starfield';
import { REPO } from '@/lib/links';
import { useTranslations } from '@/lib/i18n';
import styles from './Hero.module.css';

const SNIPPET = `// "industry" and "employees" are user-defined fields, not table
// columns, yet this compiles to an indexed range scan.
$page = $engine->read(new EntryQuery(
    tenantId: 1,
    modelId:  $companyModelId,
    filter:   new AndNode([
        LeafNode::local('industry',  'eq', 'software'),
        LeafNode::local('employees', 'gt', 100),
    ]),
    selectFields: ['name', 'employees'],
));`;

const INSTALL = 'composer require damarbob/stardust:^0.3@alpha';

export default function Hero() {
  const t = useTranslations('landing');
  const [copied, setCopied] = useState(false);

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
      <Starfield />

      <div className={`shell ${styles.inner}`}>
        <div className={styles.copy}>
          <h1 className={styles.title}>
            {t('hero.titleLine1')} {t('hero.titleLine2')}
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

        <div className={styles.code}>
          <CodeBlock code={SNIPPET} lang="php" title={t('hero.codeTitle')} />
        </div>
      </div>
    </section>
  );
}
