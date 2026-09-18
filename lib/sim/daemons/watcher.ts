/**
 * The Watcher — singleton page provisioner.
 *
 * It does one thing and pointedly does not do the obvious second thing: it adds
 * capacity, and it never claims any. A page appears with every one of its slots
 * free and the field that caused it still unmapped when the tick ends. That gap is
 * not an oversight to be tidied away — it is the separation the whole daemon
 * section exists to show, and collapsing it would turn four independent
 * processes into one pipeline with steps.
 *
 * Everything it decides comes from `capacity.ts`, which is pure and holds the
 * whole policy matrix. This file is the schedule and the logging.
 *
 * ## What is deliberately not here
 *
 * The engine's Watcher also drives two 24-hour advisory samplers — a
 * cardinality scan and a slot-spread scan — sharing one due time read from the
 * persisted `stardust_advisory_schedule` singleton (ADR 0052), not a
 * per-process jittered field: the schedule is fleet-wide, one sample per
 * interval across the whole deployment, claimed by a conditional UPDATE whose
 * affected-row count is the claim itself. `next_sample_at IS NULL` means
 * "never scheduled", and is what preserves first-sample phase randomisation —
 * the first daemon anywhere to observe it picks a random moment inside the
 * interval.
 *
 * **The claim is now simulated; the two samples it schedules are not.** Every
 * tick, `claimAdvisorySchedule()` below checks `advisoryNextSampleAt` and, the
 * first time it finds `null`, writes a due time one interval out — the same
 * conditional-claim shape as the engine, and silent the same way: no event
 * fires, because the engine's claim is a bare UPDATE and only an actual sample
 * emits `spread_sampled` / `cardinality_sampled`. What stays out is the sample
 * itself: a 24-hour cadence has nothing to show on a clock whose ticks are a
 * second apart, and firing it on some invented shorter period would put a
 * number on screen that means nothing. So `advisoryLastSampleAt` stays `null`
 * forever in this simulation — the schedule is real, the sampling is not, and
 * that boundary is deliberate rather than a gap still to close. They are
 * advisories regardless: purely observational, never blocking, never
 * remediating, so leaving the samples out changes no behaviour anywhere else.
 * `lib/sim/ddl.ts` mirrors `stardust_advisory_schedule` regardless, since
 * Section B's DDL-matches-the-engine claim covers every bootstrapped table
 * whether or not this file drives it.
 */

import { correlationId, emit } from '../emit';
import { line, type SimEvent } from '../events';
import { provisionPage } from '../page';
import {
  CAPACITY_THRESHOLD,
  globalFreeRatio,
  planProvisioning,
  readPendingDemand,
  reportCapacity,
} from '../capacity';
import { formatSimTime, simNow, type SimWorld } from '../world';

/**
 * The engine's real interval — 24 hours, at one tick per simulated second.
 * Not shortened for visibility: see the module doc above for why.
 */
export const ADVISORY_INTERVAL_TICKS = 86_400;

/**
 * `AdvisoryScheduleRepository`'s conditional claim, minus the row lock.
 *
 * The engine's version is `UPDATE ... WHERE next_sample_at IS NULL OR
 * next_sample_at <= ?`, whose *affected-row count* is the claim — the first
 * process to run it wins, and every other concurrent claimant's UPDATE matches
 * zero rows. A single-threaded simulation has no second claimant to race, so
 * the check collapses to the same `null` guard with no contention to model.
 *
 * The due time's phase is a deterministic stand-in for the engine's genuine
 * randomisation, for the same reason `emit.ts`'s `correlationId()` is not a
 * UUID: `Math.random()` inside a reducer is `new Date()` wearing a hat, and
 * React's StrictMode double-invoke would hand the two passes different
 * answers. The multiplier is an ordinary Lehmer-generator constant, chosen
 * only so the phase does not simply equal the claiming tick.
 */
function claimAdvisorySchedule(world: SimWorld): SimWorld {
  if (world.advisoryNextSampleAt !== null) return world;

  const phase = (world.clock.tick * 48_271) % ADVISORY_INTERVAL_TICKS;
  const dueTick = world.clock.tick + ADVISORY_INTERVAL_TICKS - phase;

  return {
    ...world,
    advisoryNextSampleAt: formatSimTime(dueTick),
    advisoryUpdatedAt: simNow(world),
  };
}

export function watcherTick(world: SimWorld): SimWorld {
  const corrId = correlationId('watcher', world.clock.tick);
  const snapshot = reportCapacity(world);
  const demand = readPendingDemand(world);
  const plan = planProvisioning(snapshot, demand, CAPACITY_THRESHOLD);

  let next = emit(claimAdvisorySchedule(world), (nextSeq, tick): SimEvent[] => [
    line(
      nextSeq(),
      tick,
      'watcher',
      'poll_started',
      {
        correlation_id: corrId,
        free_ratio: round4(globalFreeRatio(snapshot)),
        threshold: CAPACITY_THRESHOLD,
        total_slots: snapshot.totalSlots,
        free_slots: snapshot.totalFree,
        pages_inspected: snapshot.pagesInspected,
        usable_free_slots: plan.usableFree,
        usable_total_slots: plan.usableTotal,
        usable_free_ratio: round4(plan.usableFreeRatio),
        pending_demand: demand.families.map(f => `${f}:${demand.waiters[f].length}`).join(',') || 'none',
        pending_waiters: demand.totalWaiters,
        starved_families: plan.starvedFamilies.join(',') || 'none',
      },
    ),
  ]);

  let action = 'no_action';
  let pageId: number | null = null;

  if (plan.shouldProvision) {
    // Logged before the DDL, so the intent survives a crash inside the
    // provisioning window. The engine's ordering, kept.
    next = emit(next, (nextSeq, tick): SimEvent[] => [
      line(
        nextSeq(),
        tick,
        'watcher',
        'provision_started',
        {
          correlation_id: corrId,
          trigger: plan.trigger,
          indexed_columns: plan.indexedColumns.join(',') || 'none',
          pending_waiters: demand.totalWaiters,
        },
      ),
    ]);

    const provisioned = provisionPage(next, plan.indexedColumns, corrId);
    next = provisioned.world;
    pageId = provisioned.pageId;

    next = emit(next, (nextSeq, tick): SimEvent[] => [
      line(
        nextSeq(),
        tick,
        'watcher',
        'provision_complete',
        {
          correlation_id: corrId,
          page_id: provisioned.pageId,
          trigger: plan.trigger,
          indexed_columns: plan.indexedColumns.join(',') || 'none',
        },
      ),
    ]);

    action = 'provisioned';
  }

  next = emit(next, (nextSeq, tick): SimEvent[] => [
    line(
      nextSeq(),
      tick,
      'watcher',
      'poll_complete',
      { correlation_id: corrId, action, trigger: plan.trigger },
    ),
  ]);

  return {
    ...next,
    daemonActivity: {
      ...next.daemonActivity,
      watcher: {
        tick: world.clock.tick,
        action:
          pageId === null
            ? demand.totalWaiters > 0
              ? { key: 'daemonRoom.activity.watcherWaiting', params: { waiters: demand.totalWaiters } }
              : { key: 'daemonRoom.activity.watcherHealthy' }
            : {
                key: 'daemonRoom.activity.watcherProvisioned',
                params: { pageId, trigger: plan.trigger, indexed: plan.indexedColumns.length },
              },
      },
    },
  };
}

/** The engine rounds both ratios to four places before logging them. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
