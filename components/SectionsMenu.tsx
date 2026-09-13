'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import styles from './SectionsMenu.module.css';

export interface SectionLink {
  href: string;
  label: string;
}

/**
 * The nav bar's "How it works" dropdown — folds the landing page's four
 * in-page anchor jumps under one bar slot instead of four, which is what
 * the bar ran out of room for at seven top-level items. Desktop-only by
 * construction: `Nav.module.css` hides `.links` (this component's parent)
 * below 900px, where the hamburger panel lists the same four links flat —
 * vertical space is not scarce there, so nesting a second disclosure inside
 * the mobile menu would only add friction.
 *
 * A plain disclosure, not `role="menu"` — mirrors Nav's own hamburger
 * pattern (aria-expanded + aria-controls over a hidden panel of anchors)
 * rather than a full ARIA menu-button widget, since implementing that
 * correctly needs arrow-key roving this component does not provide.
 */
export default function SectionsMenu({ label, links }: { label: string; links: SectionLink[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
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
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(v => !v)}
      >
        {label}
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true" />
      </button>

      <div id={panelId} className={styles.menu} hidden={!open}>
        {links.map(l => (
          <a key={l.href} href={l.href} className={styles.item} onClick={close}>
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
