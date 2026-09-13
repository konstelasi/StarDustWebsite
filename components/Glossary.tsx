import type { Locale } from '@/lib/i18n';
import styles from './Glossary.module.css';

export interface GlossaryTermEntry {
  term: string;
  short: string;
}

export interface GlossaryMessages {
  hero: { eyebrow: string; title: string; lede: string };
  orientationHeading: string;
  orientation: string[];
  termsHeading: string;
  terms: Record<string, GlossaryTermEntry>;
}

/**
 * Server component so the page can enumerate all 44 terms and the six
 * orientation paragraphs straight off the loaded message tree — `Translate`
 * (lib/i18n/resolve.ts) only ever returns one string per key, so there is no
 * hook that could hand back an array or a map the way this needs.
 */
export default function Glossary({ locale, messages }: { locale: Locale; messages: GlossaryMessages }) {
  const entries = Object.entries(messages.terms).sort(([, a], [, b]) => a.term.localeCompare(b.term, locale));

  return (
    <>
      <section className="section" id="top">
        <div className="shell">
          <p className="eyebrow">{messages.hero.eyebrow}</p>
          <h1 className="section-title">{messages.hero.title}</h1>
          <p className="section-lede">{messages.hero.lede}</p>
        </div>
      </section>

      <section className="section" id="orientation">
        <div className="shell">
          <h2 className={styles.heading}>{messages.orientationHeading}</h2>
          <div className={styles.orientation}>
            {messages.orientation.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="terms">
        <div className="shell">
          <h2 className={styles.heading}>{messages.termsHeading}</h2>
          <dl className={styles.list}>
            {entries.map(([slug, entry]) => (
              <div key={slug} id={slug} className={styles.entry}>
                <dt className={styles.term}>{entry.term}</dt>
                <dd className={styles.short}>{entry.short}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
