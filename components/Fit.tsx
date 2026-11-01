'use client';

import { useMessages } from '@/lib/i18n';
import styles from './Fit.module.css';

export default function Fit() {
  const messages = useMessages();
  const landing = (messages.landing ?? {}) as {
    fit?: {
      good?: { heading?: string; items?: string[] };
      bad?: { heading?: string; items?: string[] };
      yes?: string;
      no?: string;
    };
  };
  const good = landing.fit?.good?.items ?? [];
  const bad = landing.fit?.bad?.items ?? [];

  return (
    <div className={styles.grid}>
      <div className={`${styles.column} ${styles.good}`}>
        <div className={styles.head}>
          <span>{landing.fit?.good?.heading}</span>
          <span className="tag tag-indexed">
            <span className="dot" />
            {landing.fit?.yes}
          </span>
        </div>
        <ul className={styles.list}>
          {good.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className={`${styles.column} ${styles.bad}`}>
        <div className={styles.head}>
          <span>{landing.fit?.bad?.heading}</span>
          <span className="tag tag-error">
            <span className="dot" />
            {landing.fit?.no}
          </span>
        </div>
        <ul className={styles.list}>
          {bad.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
