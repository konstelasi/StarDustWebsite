'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { useLocale, useTranslations, withLocale } from '@/lib/i18n';
import styles from './Term.module.css';

/**
 * Only one glossary popup open at a time, across every `<Term>` on the page —
 * a module-scope singleton rather than context, since a page can carry many
 * independent instances that otherwise have no reason to know about each
 * other.
 */
let activeClose: (() => void) | null = null;

const GUTTER = 12;
const OPEN_DELAY_MS = 80;
const CLOSE_DELAY_MS = 220;

type PopupStyle = CSSProperties & { '--caret-x'?: string };

interface Position {
  left: number;
  top: number;
  placement: 'above' | 'below';
  caretX: number;
}

/**
 * A dotted-underline trigger that reveals a one-sentence glossary definition
 * on hover, focus, or tap, deep-linking to the full entry on `/glossary/`.
 *
 * The trigger and the revealed popup are siblings, not parent/child — a
 * `role="button"` element must not contain focusable descendants, and the
 * popup holds a real link.
 */
export default function Term({ id, children }: { id: string; children: ReactNode }) {
  const locale = useLocale();
  const t = useTranslations('glossary');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setOpen(false);
    setPos(null);
  }, [clearTimers]);

  const openNow = useCallback(() => {
    clearTimers();
    activeClose?.();
    activeClose = close;
    setOpen(true);
  }, [clearTimers, close]);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(openNow, OPEN_DELAY_MS);
  }, [clearTimers, openNow]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
  }, [clearTimers, close]);

  // Position the popup with `getClientRects()` rather than CSS: a multi-word
  // term (e.g. "extension page") can wrap across a line break mid-sentence,
  // which fragments a single bounding box, and `body { overflow-x: hidden }`
  // (app/globals.css) clips an absolutely-positioned descendant horizontally.
  // `position: fixed` sidesteps both, since nothing between here and the
  // viewport establishes a containing block.
  useLayoutEffect(() => {
    if (!open) return;

    const reposition = () => {
      const trigger = triggerRef.current;
      const popup = popupRef.current;
      if (!trigger || !popup) return;

      const rects = Array.from(trigger.getClientRects());
      if (rects.length === 0) {
        close();
        return;
      }

      const anchorLeft = rects[0].left;
      const anchorRight = rects[0].right;
      const top = Math.min(...rects.map(r => r.top));
      const bottom = Math.max(...rects.map(r => r.bottom));

      if (bottom < 0 || top > window.innerHeight) {
        close();
        return;
      }

      const popupRect = popup.getBoundingClientRect();
      const left = Math.min(
        Math.max(anchorLeft, GUTTER),
        Math.max(GUTTER, window.innerWidth - popupRect.width - GUTTER),
      );

      const fitsBelow = bottom + 8 + popupRect.height <= window.innerHeight - GUTTER;
      const placement: Position['placement'] = fitsBelow ? 'below' : 'above';
      const placedTop = placement === 'below' ? bottom + 8 : top - popupRect.height - 8;

      const caretX = Math.min(
        Math.max(anchorLeft + (anchorRight - anchorLeft) / 2 - left, 14),
        Math.max(14, popupRect.width - 14),
      );

      setPos({ left, top: placedTop, placement, caretX });
    };

    reposition();

    let raf = 0;
    const onScrollOrResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(reposition);
    };

    // `capture: true` so a scroll inside any nested scroller (not just the
    // window) still triggers a reposition.
    window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScrollOrResize, { capture: true });
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, close]);

  // Escape and outside-click dismissal — same shape as LanguageSwitcher.tsx.
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

  useEffect(() => clearTimers, [clearTimers]);

  const handleTriggerKeyDown = (e: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) close();
      else openNow();
    }
  };

  // Shared by the trigger and the popup's own link: don't close while focus
  // is moving to something still inside this widget.
  const closeUnlessStillInside = (e: ReactFocusEvent) => {
    const next = e.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    close();
  };

  const onMouseEnter = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') scheduleOpen();
  };
  const onMouseLeave = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') scheduleClose();
  };

  const term = t(`terms.${id}.term`);
  const short = t(`terms.${id}.short`);
  const more = t('popup.more');
  const href = `${withLocale(locale, '/glossary/')}#${id}`;
  const popupId = `term-popup-${id}`;

  const popupStyle: PopupStyle = pos
    ? { left: pos.left, top: pos.top, visibility: 'visible', '--caret-x': `${pos.caretX}px` }
    : { left: 0, top: 0, visibility: 'hidden' };

  return (
    <span ref={rootRef} className={styles.root}>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={popupId}
        className={styles.trigger}
        onPointerEnter={onMouseEnter}
        onPointerLeave={onMouseLeave}
        onClick={() => (open ? close() : openNow())}
        onFocus={openNow}
        onBlur={closeUnlessStillInside}
        onKeyDown={handleTriggerKeyDown}
      >
        {children}
      </span>
      <div
        ref={popupRef}
        id={popupId}
        hidden={!open}
        className={styles.popup}
        style={popupStyle}
        data-placement={pos?.placement ?? 'below'}
        onPointerEnter={clearTimers}
        onPointerLeave={onMouseLeave}
      >
        <strong className={styles.term}>{term}</strong>
        <p className={styles.short}>{short}</p>
        <a className={styles.more} href={href} onBlur={closeUnlessStillInside}>
          {more}
        </a>
      </div>
    </span>
  );
}
