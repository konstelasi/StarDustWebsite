/**
 * Hold the glossary catalog consistent with what the landing pages actually
 * reference.
 *
 * Nothing else catches this. A typecheck sees `<Term id={string}>` and is
 * satisfied by any string; a build sees a component that falls back to the
 * raw key on a miss (`lib/i18n/resolve.ts`) and renders it anyway — a typo'd
 * id ships as visible mojibake rather than a build failure. The failure this
 * exists to catch: a `<Term id="...">` added to a page with no matching entry
 * in `messages/{en,id}/glossary.json`, the two locale catalogs drifting apart
 * (a term added to one and not the other), or a "short" definition that grew
 * past the one sentence the popup and the page both assume.
 *
 * **The page list is a directory walk, not a hardcoded array.** It used to be
 * `['app/(en)/page.tsx', 'app/id/page.tsx']` — correct when `<Term>` had
 * exactly two call sites, and silently blind the moment a third page started
 * using it, on the same shape of trap the engine's own `EventVocabularyTest`
 * documents: a scan that only covers the directories someone remembered to
 * list stays green while a new one goes unchecked. Every `.tsx` under `app/`
 * and `components/` is scanned instead, so a new page or component that marks
 * a term is covered for free.
 *
 * Run with `npm run verify:glossary`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

let failed = false;

function fail(message: string): void {
  failed = true;
  console.error(message);
}

function pass(message: string): void {
  console.log(`  ${message}`);
}

// __dirname is `.scenario-build/scripts` (see tsconfig.scripts.json), two
// levels below the project root the other verify scripts are run from.
const ROOT = join(__dirname, '..', '..');

interface GlossaryCatalog {
  terms: Record<string, { term: string; short: string }>;
}

function readGlossary(locale: string): GlossaryCatalog {
  const raw = readFileSync(join(ROOT, 'messages', locale, 'glossary.json'), 'utf8');
  return JSON.parse(raw) as GlossaryCatalog;
}

/** Every `<Term id="...">` occurrence in one file, in appearance order. */
function termIdsIn(relativePath: string): string[] {
  const source = readFileSync(join(ROOT, relativePath), 'utf8');
  return Array.from(source.matchAll(/<Term id="([a-z0-9-]+)"/g), m => m[1]);
}

/**
 * Every `.tsx` file under `app/` and `components/`, relative to `ROOT`.
 *
 * `node_modules` and Next's `.next`/`out` build directories are skipped on
 * general principle, though neither ever appears under these two roots.
 */
function listTsxFiles(relativeDir: string): string[] {
  const dir = join(ROOT, relativeDir);
  const out: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = join(relativeDir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'out') continue;
      out.push(...listTsxFiles(rel));
    } else if (entry.endsWith('.tsx')) {
      out.push(rel);
    }
  }

  return out;
}

/** A definition is meant to be one sentence — no internal sentence break before the final punctuation mark. */
function isOneSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!/[.!?]$/.test(trimmed)) return false;
  const body = trimmed.slice(0, -1);
  return !/[.!?]\s/.test(body);
}

console.log('marked pages still carry <Term>');

// Pages known to lean on the glossary for their prose. Unlike the walk below,
// a page landing here with zero markers is worth failing loudly over — it
// means the marking was lost, not merely that this particular file has none.
const EXPECTED_TERM_PAGES = [
  'app/(en)/page.tsx',
  'app/id/page.tsx',
  'app/(en)/custom-fields/page.tsx',
  'app/id/custom-fields/page.tsx',
];
const catalogs: Record<string, GlossaryCatalog> = { en: readGlossary('en'), id: readGlossary('id') };

for (const page of EXPECTED_TERM_PAGES) {
  const ids = termIdsIn(page);
  if (ids.length === 0) {
    fail(`✗ ${page}: no <Term> markers found — is the marking still there?`);
  } else {
    pass(`✓ ${page}: carries ${ids.length} marked term(s)`);
  }
}

console.log('\nevery marked term id resolves');

// Every .tsx under app/ and components/, not just the pages above — a term
// marked in a new file is checked automatically instead of escaping until
// someone remembers to add it to a list.
const ALL_TSX_FILES = [...listTsxFiles('app'), ...listTsxFiles('components')];

for (const file of ALL_TSX_FILES) {
  const ids = termIdsIn(file);
  if (ids.length === 0) continue;

  let allResolved = true;
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const id of ids) {
      if (!(id in catalog.terms)) {
        fail(`✗ ${file}: <Term id="${id}"> has no entry in messages/${locale}/glossary.json`);
        allResolved = false;
      }
    }
  }

  // A term marked more than twice in one file reads as clutter rather than
  // help — `Term`'s own popup keeps only one open at a time, so a paragraph
  // dense with dotted underlines is worse UX than marking the word once on
  // first use and leaving the rest of the page plain.
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (count > 2) {
      fail(`✗ ${file}: <Term id="${id}"> appears ${count} times — mark it once, on first use`);
      allResolved = false;
    }
  }

  if (allResolved) pass(`✓ ${file}: all ${ids.length} marked term(s) resolve in both locales`);
}

console.log('\nlocale catalogs match');

const enKeys = Object.keys(catalogs.en.terms).sort();
const idKeys = Object.keys(catalogs.id.terms).sort();

if (JSON.stringify(enKeys) !== JSON.stringify(idKeys)) {
  const onlyEn = enKeys.filter(k => !idKeys.includes(k));
  const onlyId = idKeys.filter(k => !enKeys.includes(k));
  if (onlyEn.length) fail(`✗ present only in en/glossary.json: ${onlyEn.join(', ')}`);
  if (onlyId.length) fail(`✗ present only in id/glossary.json: ${onlyId.join(', ')}`);
} else {
  pass(`✓ ${enKeys.length} terms, identical keys in both locales`);
}

console.log('\ndefinitions are one sentence');

for (const [locale, catalog] of Object.entries(catalogs)) {
  for (const [id, entry] of Object.entries(catalog.terms)) {
    if (!isOneSentence(entry.short)) {
      fail(`✗ messages/${locale}/glossary.json: terms.${id}.short is not a single sentence — "${entry.short}"`);
    }
  }
}
if (!failed) pass(`✓ every "short" definition in both locales is a single sentence`);

console.log(failed ? '\nFAILED' : '\nall glossary checks green');
process.exit(failed ? 1 : 0);
