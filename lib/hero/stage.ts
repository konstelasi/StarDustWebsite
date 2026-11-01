/**
 * The data behind the hero's stage and console.
 *
 * Built by running the simulator, not by writing strings. A small `company`
 * model gets 400 deterministic entries, two of its three fields are promoted
 * to filterable and the clock runs until both indexes are live. Each preset
 * filter is then pushed through `runSearch()`, so the SQL, the strategy and
 * the refusal on the page are what the playground would show for the same
 * filter, and the lit points are the entries `matchesNode()` accepts.
 *
 * This runs once, on the server, while the site is built. The result is plain
 * data, so the simulator itself never reaches the browser bundle from here.
 * Keep it that way: import this module from a server component and pass the
 * result down, and let client components import only its types.
 *
 * Deterministic on purpose. There is no `Math.random()` and no clock read, so
 * a rebuild produces the same stars.
 */

import { reduce, type SimAction } from '../sim/reduce';
import { emptyWorld, fieldIndexState, type SimWorld } from '../sim/world';
import { bulkWriteEntries } from '../sim/write';
import type { FilterNode } from '../sim/filter/ast';
import { matchesNode, runSearch } from '../sim/search/execute';
import { snapshotForModel } from '../sim/search/snapshot';

type Payloads = Parameters<typeof bulkWriteEntries>[2];

const MODEL = 1;
const INDUSTRY = 1;
const EMPLOYEES = 2;

const COMPANY_COUNT = 400;

const INDUSTRIES = [
  { name: 'software', weight: 0.22 },
  { name: 'retail', weight: 0.24 },
  { name: 'finance', weight: 0.18 },
  { name: 'health', weight: 0.2 },
  { name: 'logistics', weight: 0.16 },
];

const CITIES = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Makassar', 'Singapore'];

/** Left edge and right edge of the stage's employee axis, as powers of ten. */
const AXIS_MIN_EXP = 1;
const AXIS_MAX_EXP = 4;

export type HeroPresetId = 'range' | 'and' | 'or' | 'refused';

export interface HeroPreset {
  id: HeroPresetId;
  /** The filter as the tab shows it. Code, so it is not translated. */
  label: string;
  /** The filter expression as PHP. */
  php: string;
  /** Query 1 of the read, one clause per line. Empty when the filter was refused. */
  sql: string;
  /** The bindings, rendered the way a log line would show them. */
  bindings: string[];
  strategy: 'joins' | 'exists' | null;
  /** `INNER JOIN`s in the probe, not counting `entry_data` itself. */
  joins: number;
  /** Entries in the sample that satisfy the filter. Zero when refused. */
  matched: number;
  rejection: { exception: string; code: string; field: string } | null;
  /** Where the stage draws its guides. */
  guides: {
    /** Employees threshold, drawn as a vertical rule, or null. */
    employeesAbove: number | null;
    /** The same threshold as a position along the stage, 0 to 1, or null. */
    thresholdX: number | null;
    /** Index into `bands` for an industry equality, or null. */
    band: number | null;
  };
}

/** `[x, y, radius, phase, mask]`. Bit n of `mask` is set when preset n matches. */
export type HeroPoint = [x: number, y: number, r: number, phase: number, mask: number];

export interface HeroStage {
  total: number;
  bands: string[];
  /** Axis ticks as employee counts, with their position along x. */
  ticks: { value: number; x: number }[];
  points: HeroPoint[];
  presets: HeroPreset[];
}

/** mulberry32. Small, seedable and good enough to scatter a few hundred stars. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickIndustry(u: number): number {
  let acc = 0;
  for (let i = 0; i < INDUSTRIES.length; i++) {
    acc += INDUSTRIES[i].weight;
    if (u < acc) return i;
  }
  return INDUSTRIES.length - 1;
}

interface Company {
  industry: number;
  employees: number;
  city: string;
}

function companies(): Company[] {
  const rand = rng(20261018);
  const out: Company[] = [];
  for (let i = 0; i < COMPANY_COUNT; i++) {
    const industry = pickIndustry(rand());
    const exp = AXIS_MIN_EXP + (AXIS_MAX_EXP - AXIS_MIN_EXP) * Math.pow(rand(), 1.1);
    const employees = Math.round(Math.pow(10, exp));
    const city = CITIES[Math.floor(rand() * CITIES.length)];
    out.push({ industry, employees, city });
  }
  return out;
}

function run(world: SimWorld, ...actions: SimAction[]): SimWorld {
  return actions.reduce((current, action) => reduce(current, action), world);
}

/** A company model, its rows, and both indexes live. */
function settledWorld(rows: Company[]): SimWorld {
  let world = run(
    emptyWorld(),
    { type: 'world/reset' },
    { type: 'draft/setName', name: 'company' },
    { type: 'draft/addField', declaredType: 'string' },
    { type: 'draft/patchField', key: 'd1', patch: { name: 'industry' } },
    { type: 'draft/addField', declaredType: 'int' },
    { type: 'draft/patchField', key: 'd2', patch: { name: 'employees' } },
    { type: 'draft/addField', declaredType: 'string' },
    { type: 'draft/patchField', key: 'd3', patch: { name: 'city' } },
    { type: 'registry/createModel' },
  );

  const payloads: Payloads = rows.map(row => ({
    industry: INDUSTRIES[row.industry].name,
    employees: row.employees,
    city: row.city,
  }));
  const written = bulkWriteEntries(world, MODEL, payloads);
  if (written.error !== null || written.entriesCommitted !== rows.length) {
    throw new Error(`hero stage: bulk write failed (${written.error ?? 'short write'})`);
  }
  world = written.world;

  world = run(world, { type: 'field/promote', fieldId: INDUSTRY }, { type: 'field/promote', fieldId: EMPLOYEES });
  for (let i = 0; i < 40; i++) {
    if (fieldIndexState(world, INDUSTRY) === 'live' && fieldIndexState(world, EMPLOYEES) === 'live') break;
    world = reduce(world, { type: 'clock/tick' });
  }
  if (fieldIndexState(world, INDUSTRY) !== 'live' || fieldIndexState(world, EMPLOYEES) !== 'live') {
    throw new Error('hero stage: the indexes did not go live within 40 ticks');
  }
  return world;
}

const leaf = (name: string, op: 'eq' | 'gt', value: string | number): FilterNode => ({
  op,
  field: { model: 'company', name },
  value,
});

interface PresetSpec {
  id: HeroPresetId;
  label: string;
  php: string;
  filter: FilterNode;
  guides: Omit<HeroPreset['guides'], 'thresholdX'>;
}

const SOFTWARE_BAND = 0;

const SPECS: PresetSpec[] = [
  {
    id: 'range',
    label: "employees > 100",
    php: "LeafNode::local('employees', 'gt', 100)",
    filter: leaf('employees', 'gt', 100),
    guides: { employeesAbove: 100, band: null },
  },
  {
    id: 'and',
    label: "industry = 'software' AND employees > 100",
    php: [
      'new AndNode([',
      "    LeafNode::local('industry',  'eq', 'software'),",
      "    LeafNode::local('employees', 'gt', 100),",
      '])',
    ].join('\n'),
    filter: { op: 'and', args: [leaf('industry', 'eq', 'software'), leaf('employees', 'gt', 100)] },
    guides: { employeesAbove: 100, band: SOFTWARE_BAND },
  },
  {
    id: 'or',
    label: "industry = 'software' OR employees > 1000",
    php: [
      'new OrNode([',
      "    LeafNode::local('industry',  'eq', 'software'),",
      "    LeafNode::local('employees', 'gt', 1000),",
      '])',
    ].join('\n'),
    filter: { op: 'or', args: [leaf('industry', 'eq', 'software'), leaf('employees', 'gt', 1000)] },
    guides: { employeesAbove: 1000, band: SOFTWARE_BAND },
  },
  {
    id: 'refused',
    label: "city = 'Jakarta'",
    php: "LeafNode::local('city', 'eq', 'Jakarta')",
    filter: leaf('city', 'eq', 'Jakarta'),
    guides: { employeesAbove: null, band: null },
  },
];

/**
 * One clause per line, with each slot predicate on a line of its own so the
 * indexed columns are easy to find. Presentation only: the SQL is not
 * rewritten, just wrapped. It follows the playground's plan panel, plus the
 * extra breaks the EXISTS form needs.
 */
function formatSql(sql: string): string {
  return sql
    .replace(/ (FROM|INNER JOIN|LEFT JOIN|CROSS JOIN|WHERE|ORDER BY|LIMIT) /g, '\n$1 ')
    .replace(/ AND (entry_data\.|\(EXISTS|NOT |p\d+\.|s\.)/g, '\n  AND $1')
    .replace(/\) OR EXISTS/g, ')\n  OR EXISTS')
    .replace(/\n(FROM|WHERE) (entry_slots_page_\d+ s|s\.tenant_id)/g, '\n    $1 $2')
    .replace(/\n  AND (s\.)/g, '\n      AND $1');
}

function renderBinding(value: unknown): string {
  return typeof value === 'string' ? `'${value}'` : String(value);
}

const round = (n: number, places = 3): number => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

/** Position along the stage's employee axis, 0 at the left edge and 1 at the right. */
const axisX = (employees: number): number =>
  (Math.log10(employees) - AXIS_MIN_EXP) / (AXIS_MAX_EXP - AXIS_MIN_EXP);

const withX = (guides: PresetSpec['guides']): HeroPreset['guides'] => ({
  ...guides,
  thresholdX: guides.employeesAbove === null ? null : round(axisX(guides.employeesAbove), 4),
});

export function buildHeroStage(): HeroStage {
  const rows = companies();
  const world = settledWorld(rows);
  const snapshot = snapshotForModel(world, MODEL);
  if (snapshot === null) throw new Error('hero stage: no snapshot for the company model');

  const entries = world.entries.filter(entry => entry.modelId === MODEL && entry.deletedAt === null);
  if (entries.length !== rows.length) {
    throw new Error(`hero stage: expected ${rows.length} entries, found ${entries.length}`);
  }

  const masks = new Array<number>(entries.length).fill(0);
  const presets: HeroPreset[] = SPECS.map((spec, presetIndex) => {
    const searched = runSearch(
      world,
      { tenantId: world.tenantId, modelId: MODEL, filter: spec.filter, sort: null, pageSize: 24, cursor: null },
      'hero-stage',
    ).result;

    if (!searched.ok) {
      if (searched.rejection === null) throw new Error('hero stage: the search found no snapshot');
      return {
        id: spec.id,
        label: spec.label,
        php: spec.php,
        sql: '',
        bindings: [],
        strategy: null,
        joins: 0,
        matched: 0,
        rejection: {
          exception: searched.rejection.exception,
          code: searched.rejection.errorCode,
          field: searched.rejection.fieldName,
        },
        guides: withX(spec.guides),
      };
    }

    let matched = 0;
    entries.forEach((entry, i) => {
      if (matchesNode(entry, spec.filter, snapshot)) {
        masks[i] |= 1 << presetIndex;
        matched++;
      }
    });

    const { outcome } = searched;
    if (matched !== outcome.matchedCount) {
      throw new Error(
        `hero stage: ${spec.id} matched ${matched} entries here but ${outcome.matchedCount} in the search`,
      );
    }
    const sql = formatSql(outcome.probe.sql);
    return {
      id: spec.id,
      label: spec.label,
      php: spec.php,
      sql,
      bindings: outcome.probe.bindings.map(renderBinding),
      strategy: outcome.strategy,
      joins: (sql.match(/INNER JOIN/g) ?? []).length,
      matched,
      rejection: null,
      guides: withX(spec.guides),
    };
  });

  const scatter = rng(7);
  const points: HeroPoint[] = rows.map((row, i) => {
    const x = axisX(row.employees);
    const y = (row.industry + 0.16 + 0.68 * scatter()) / INDUSTRIES.length;
    const r = 0.7 + 1.5 * scatter();
    return [round(x, 4), round(y, 4), round(r, 2), round(scatter() * Math.PI * 2, 2), masks[i]];
  });

  const ticks = [10, 100, 1000, 10000].map(value => ({
    value,
    x: axisX(value),
  }));

  return { total: rows.length, bands: INDUSTRIES.map(i => i.name), ticks, points, presets };
}
