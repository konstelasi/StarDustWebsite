'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './LanguageSwitcher.module.css';

export interface LanguageOption {
  code: string;
  /** Path to the flag SVG under public/, e.g. '/flags/us.svg'. Not a Unicode
   * flag emoji — Windows' default emoji font renders those as plain "US"/"ID"
   * letter pairs instead of a flag glyph. */
  flag: string;
  label: string;
  href: string;
}

export default function LanguageSwitcher({
  languages,
  current,
  ariaLabel,
  onNavigate,
  variant = 'pill',
  className,
}: {
  languages: LanguageOption[];
  current: string;
  ariaLabel: string;
  /** Fired when an option is picked — lets the mobile menu close itself too. */
  onNavigate?: () => void;
  /** 'pill' is the desktop bar trigger; 'block' matches a stacked mobile-menu row. */
  variant?: 'pill' | 'block';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = languages.find(l => l.code === current) ?? languages[0];

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onPointer = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) close();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, close]);

  return (
    <div className={`${styles.root} ${className ?? ''}`} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${variant === 'block' ? styles.triggerBlock : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${active.label}`}
        title={active.label}
        onClick={() => setOpen(v => !v)}
      >
        <img src={active.flag} alt="" width={20} height={14} className={styles.flag} />
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true" />
      </button>

      <ul
        className={`${styles.menu} ${variant === 'block' ? styles.menuBlock : ''}`}
        role="listbox"
        aria-label={ariaLabel}
        hidden={!open}
      >
        {languages.map(l => (
          <li key={l.code} role="presentation">
            <a
              role="option"
              aria-selected={l.code === current}
              href={l.href}
              className={`${styles.option} ${l.code === current ? styles.optionActive : ''}`}
              onClick={() => { close(); onNavigate?.(); }}
            >
              <img src={l.flag} alt="" width={20} height={14} className={styles.flag} />
              <span>{l.label}</span>
              {l.code === current && <span className={styles.check} aria-hidden="true">✓</span>}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
