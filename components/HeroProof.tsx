'use client';

import { useMemo } from 'react';
import { tokenize, type Lang } from '@/lib/highlight';
import { useTranslations } from '@/lib/i18n';
import type { HeroPreset, HeroStage } from '@/lib/hero/stage';
import code from './CodeBlock.module.css';
import styles from './HeroProof.module.css';

/**
 * The site's code colours, except that PHP types and strings step back to
 * neutrals here. Teal means "indexed" in this block and nothing else may use it.
 */
const KIND_CLASS: Record<string, string | undefined> = {
  type: styles.type,
  string: styles.string,
};

/** `p0.i_int_01`, `s.i_str_01`: the typed, indexed slot columns. */
const SLOT_COLUMN = /\b((?:p\d+|s)\.i_[a-z]+_\d+)\b/;

function Highlighted({ text, lang }: { text: string; lang: Lang }) {
  const tokens = useMemo(() => tokenize(text, lang), [text, lang]);
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={KIND_CLASS[token.kind] ?? code[token.kind] ?? undefined}>
          {token.text}
        </span>
      ))}
    </>
  );
}

/** SQL with the slot columns picked out in the colour the site uses for "indexed". */
function Sql({ sql }: { sql: string }) {
  const parts = useMemo(() => sql.split(new RegExp(SLOT_COLUMN.source, 'g')), [sql]);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className={styles.slot}>
            {part}
          </span>
        ) : (
          <Highlighted key={i} text={part} lang="sql" />
        ),
      )}
    </>
  );
}

/** The filter, wrapped in the read call it belongs to. */
function readCall(php: string): string {
  return [
    '$page = $engine->read(new EntryQuery(',
    '    tenantId: 1,',
    '    modelId:  $companyModelId,',
    `    filter:   ${php.replace(/\n/g, '\n    ')},`,
    '));',
  ].join('\n');
}

export default function HeroProof({ stage, active }: { stage: HeroStage; active: number }) {
  const t = useTranslations('landing');
  const current = stage.presets[active];

  return (
    <div className={`shell ${styles.proof}`}>
      <div className={styles.panes}>
        {stage.presets.map((preset, i) => (
          <Pair key={preset.id} preset={preset} on={i === active} />
        ))}
      </div>

      <p className={styles.facts} aria-live="polite">
        {current.rejection ? (
          <>
            <span className={styles.refused}>{t('hero.refusedTag')}</span>
            <code>{current.rejection.code}</code>
            <span>{t('hero.noSql')}</span>
          </>
        ) : (
          <>
            <span>{t('hero.strategyFact', { strategy: current.strategy ?? '' })}</span>
            <span>
              {current.joins === 1
                ? t('hero.joinsOne')
                : t('hero.joinsMany', { count: current.joins })}
            </span>
            <span>{t('hero.matches', { matched: current.matched, total: stage.total })}</span>
          </>
        )}
      </p>

      <p className={styles.note}>{t('hero.simNote', { total: stage.total })}</p>
    </div>
  );
}

function Pair({ preset, on }: { preset: HeroPreset; on: boolean }) {
  const t = useTranslations('landing');
  const call = useMemo(() => readCall(preset.php), [preset.php]);

  return (
    <div className={`${styles.pair} ${on ? styles.pairOn : ''}`} aria-hidden={on ? undefined : true}>
      <div className={styles.pane}>
        <p className={styles.paneLabel}>{t('hero.youWrite')}</p>
        <pre className={styles.pre} tabIndex={on ? 0 : -1} role="region" aria-label={t('hero.youWrite')}>
          <code>
            <Highlighted text={call} lang="php" />
          </code>
        </pre>
      </div>

      <span className={styles.arrow} aria-hidden="true">
        →
      </span>

      <div className={styles.pane}>
        <p className={styles.paneLabel}>{t('hero.mysqlRuns')}</p>
        {preset.rejection ? (
          <div className={`${styles.pre} ${styles.refusal}`}>
            <p className={styles.refusalTitle}>{t('hero.refusedTitle')}</p>
            <code className={styles.refusalCode}>{preset.rejection.exception}</code>
            <p className={styles.refusalBody}>
              {t('hero.refusedBody', { field: preset.rejection.field })}
            </p>
          </div>
        ) : (
          <pre className={styles.pre} tabIndex={on ? 0 : -1} role="region" aria-label={t('hero.mysqlRuns')}>
            <code>
              <Sql sql={preset.sql} />
              {'\n\n'}
              <span className={styles.bindings}>
                {t('hero.bindings')} {preset.bindings.join(', ')}
              </span>
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
