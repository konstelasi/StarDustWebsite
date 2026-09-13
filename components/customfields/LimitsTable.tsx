import type { ReactNode } from 'react';
import styles from './LimitsTable.module.css';

export type LimitItem = { title: ReactNode; body: ReactNode };

/**
 * What you would hit — the section this site did not have before.
 *
 * Prop-driven rather than translated through `messages/`: several items name
 * glossary terms inline (`<Term>`), and `Translate` returns a plain string
 * with no way to carry JSX — the same reason the landing page's own prose is
 * hand-written per locale rather than pulled from `landing.json`. Each of
 * `app/(en)/custom-fields/page.tsx` and `app/id/custom-fields/page.tsx`
 * supplies its own localized `items`.
 */
export default function LimitsTable({ items }: { items: LimitItem[] }) {
  return (
    <div className={styles.list}>
      {items.map((item, i) => (
        <div key={i} className={styles.item}>
          <h3 className={styles.title}>{item.title}</h3>
          <p className={styles.body}>{item.body}</p>
        </div>
      ))}
    </div>
  );
}
