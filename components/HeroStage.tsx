'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/lib/useReducedMotion';
import type { HeroStage as StageData } from '@/lib/hero/stage';
import styles from './HeroStage.module.css';

type Props = {
  data: StageData;
  /** Index of the selected preset. */
  active: number;
  /** Names the figure for assistive tech. */
  label: string;
  axisLabel: string;
};

const TEAL: readonly [number, number, number] = [47, 212, 189];
const STAR: readonly [number, number, number] = [234, 234, 234];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgb = (c: readonly [number, number, number]) => `${c[0]}, ${c[1]}, ${c[2]}`;
const blend = (t: number) =>
  `${Math.round(lerp(STAR[0], TEAL[0], t))}, ${Math.round(lerp(STAR[1], TEAL[1], t))}, ${Math.round(lerp(STAR[2], TEAL[2], t))}`;

/** How far the sweep takes to cross the whole stage, in ms. */
const SWEEP_MS = 650;
/** Pause before the first filter lights, so the dim field is seen first. */
const FIRST_DELAY_MS = 500;

interface Guides {
  x: number;
  xTarget: number;
  /** The region right of the threshold, over every band. */
  right: number;
  rightTarget: number;
  /** The same region, inside one band. */
  bandRight: number;
  bandRightTarget: number;
  /** One whole band. */
  bandFull: number;
  bandFullTarget: number;
  band: number;
  value: number;
  /** 1 when something is lit, so the unlit stars step back. */
  focus: number;
  focusTarget: number;
}

/**
 * The hero's stage: every sample company as a star, placed by employee count
 * along a log axis and by industry in a band. An index is an ordered
 * structure, so a range filter is a contiguous run of it. Selecting a filter
 * lights the entries it matches, sweeping outward from the threshold, and
 * leaves the rest dim.
 *
 * Which stars light comes from the simulator's own matcher (see
 * `lib/hero/stage.ts`), not from anything computed here. This component only
 * draws. Under reduced motion it jumps to the settled state and stops
 * animating, as every demo on the site does.
 */
export default function HeroStage({ data, active, label, axisLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();
  const activeRef = useRef(active);
  const applyRef = useRef<((index: number, first: boolean) => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { points, bands, ticks, presets } = data;
    const n = points.length;
    const lit = new Float32Array(n);
    const target = new Uint8Array(n);
    const since = new Float64Array(n);
    const guide: Guides = {
      x: 0.33, xTarget: 0.33,
      right: 0, rightTarget: 0,
      bandRight: 0, bandRightTarget: 0,
      bandFull: 0, bandFullTarget: 0,
      band: 0, value: 100,
      focus: 0, focusTarget: 0,
    };

    const mono =
      getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace';

    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    let seen = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      const narrow = w < 640;
      const padL = narrow ? 14 : 132;
      const padR = narrow ? 14 : 44;
      const padT = 32;
      const padB = 36;
      const x0 = padL;
      const x1 = w - padR;
      const y0 = padT;
      const y1 = h - padB;
      const pw = x1 - x0;
      const ph = y1 - y0;
      const bh = ph / bands.length;
      const gx = x0 + guide.x * pw;
      const bandY = y0 + guide.band * bh;

      const fill = (alpha: number, x: number, y: number, fw: number, fh: number) => {
        if (alpha < 0.002) return;
        ctx.fillStyle = `rgba(${rgb(TEAL)}, ${alpha})`;
        ctx.fillRect(x, y, fw, fh);
      };
      fill(0.05 * guide.right, gx, y0, x1 - gx, ph);
      fill(0.08 * guide.bandRight, gx, bandY, x1 - gx, bh);
      fill(0.05 * guide.bandFull, x0, bandY, pw, bh);

      // Band rules, and the axis ticks as faint verticals.
      const ruleLeft = narrow ? 0 : 16;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      for (let i = 0; i <= bands.length; i++) {
        ctx.fillRect(ruleLeft, Math.round(y0 + i * bh), w - ruleLeft - (narrow ? 0 : 16), 1);
      }
      for (const tick of ticks) {
        ctx.fillRect(Math.round(x0 + tick.x * pw), y0, 1, ph);
      }

      // The selected band, picked out by two teal rules.
      const bandLine = Math.max(guide.bandFull, guide.bandRight);
      if (bandLine > 0.01) {
        ctx.fillStyle = `rgba(${rgb(TEAL)}, ${0.45 * bandLine})`;
        ctx.fillRect(ruleLeft, Math.round(bandY), w - ruleLeft - (narrow ? 0 : 16), 1);
        ctx.fillRect(ruleLeft, Math.round(bandY + bh), w - ruleLeft - (narrow ? 0 : 16), 1);
      }

      // The threshold.
      const ruleA = Math.max(guide.right, guide.bandRight);
      if (ruleA > 0.01) {
        ctx.fillStyle = `rgba(${rgb(TEAL)}, ${0.85 * ruleA})`;
        ctx.fillRect(Math.round(gx), y0 - 12, 1, ph + 12);
        ctx.font = `11px ${mono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`> ${guide.value.toLocaleString('en-US')}`, gx + 7, y0 - 14);
      }

      // The stars.
      for (let i = 0; i < n; i++) {
        const p = points[i];
        const l = lit[i];
        const twinkle = reduced ? 1 : 0.82 + 0.18 * Math.sin(now / 1300 + p[3]);
        const base = (0.2 + 0.2 * (p[2] / 2.2)) * twinkle;
        const dim = 1 - 0.55 * guide.focus * (1 - l);
        const alpha = base * dim * (1 - l) + 0.95 * l;
        ctx.fillStyle = `rgba(${blend(l)}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x0 + p[0] * pw, y0 + p[1] * ph, p[2] * (1 + 0.35 * l), 0, Math.PI * 2);
        ctx.fill();
      }

      // Labels last, so no star sits over them.
      ctx.font = `11px ${mono}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      for (const tick of ticks) {
        ctx.fillText(tick.value.toLocaleString('en-US'), x0 + tick.x * pw, y1 + 18);
      }
      if (!narrow) {
        // Top left, not under the axis: the first tick label sits at the left
        // edge of the plot and a caption this long runs straight into it.
        ctx.textAlign = 'left';
        ctx.fillText(`${axisLabel} →`, 24, y0 - 14);
        const lineA = Math.max(guide.bandFull, guide.bandRight);
        bands.forEach((name, i) => {
          const picked = i === guide.band ? lineA : 0;
          ctx.fillStyle = `rgba(${blend(picked)}, ${0.4 + 0.5 * picked})`;
          ctx.fillText(name, 24, y0 + (i + 0.5) * bh);
        });
      }
    };

    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const ease = (tau: number) => 1 - Math.exp(-dt / tau);
      for (let i = 0; i < n; i++) {
        if (now < since[i]) continue;
        lit[i] += (target[i] - lit[i]) * ease(target[i] === 1 ? 110 : 80);
      }
      guide.x += (guide.xTarget - guide.x) * ease(170);
      guide.right += (guide.rightTarget - guide.right) * ease(150);
      guide.bandRight += (guide.bandRightTarget - guide.bandRight) * ease(150);
      guide.bandFull += (guide.bandFullTarget - guide.bandFull) * ease(150);
      guide.focus += (guide.focusTarget - guide.focus) * ease(200);
    };

    const frame = (now: number) => {
      raf = 0;
      step(now);
      draw(now);
      if (!reduced && visible) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (reduced || !visible || raf !== 0) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const apply = (index: number, first: boolean) => {
      const preset = presets[index];
      if (!preset) return;
      const bit = 1 << index;
      const now = performance.now();
      const origin = preset.guides.thresholdX ?? 0;

      for (let i = 0; i < n; i++) {
        const on = (points[i][4] & bit) !== 0 ? 1 : 0;
        if (on === target[i]) continue;
        target[i] = on;
        if (reduced) {
          lit[i] = on;
          since[i] = 0;
        } else {
          const sweep = on ? Math.max(0, points[i][0] - origin) * SWEEP_MS : 0;
          since[i] = now + (first ? FIRST_DELAY_MS : 0) + sweep;
        }
      }

      const hasRule = preset.guides.thresholdX !== null;
      if (hasRule) {
        guide.xTarget = preset.guides.thresholdX ?? guide.xTarget;
        guide.value = preset.guides.employeesAbove ?? guide.value;
      }
      if (preset.guides.band !== null) guide.band = preset.guides.band;
      guide.rightTarget = preset.id === 'range' || preset.id === 'or' ? 1 : 0;
      guide.bandRightTarget = preset.id === 'and' ? 1 : 0;
      guide.bandFullTarget = preset.id === 'or' ? 1 : 0;
      guide.focusTarget = preset.matched > 0 ? 1 : 0;

      if (reduced) {
        guide.x = guide.xTarget;
        guide.right = guide.rightTarget;
        guide.bandRight = guide.bandRightTarget;
        guide.bandFull = guide.bandFullTarget;
        guide.focus = guide.focusTarget;
        draw(now);
      } else {
        start();
      }
    };

    resize();
    applyRef.current = apply;
    apply(activeRef.current, true);
    if (reduced) draw(performance.now());

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduced || raf === 0) draw(performance.now());
    });
    resizeObserver.observe(canvas);

    const visibility = new IntersectionObserver(entries => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (!visible) return;
      if (!seen) {
        // The first sweep is meant to be watched. If the stage began below the
        // fold, play it when it first scrolls into view rather than offscreen.
        seen = true;
        lit.fill(0);
        target.fill(0);
        apply(activeRef.current, true);
      }
      start();
    });
    visibility.observe(canvas);

    return () => {
      applyRef.current = null;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      visibility.disconnect();
    };
  }, [data, reduced, axisLabel]);

  useEffect(() => {
    activeRef.current = active;
    applyRef.current?.(active, false);
  }, [active]);

  return (
    <figure className={styles.stage} aria-label={label}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </figure>
  );
}
