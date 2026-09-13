/**
 * Hold the glossary catalog consistent with what the landing pages actually
 * reference.
 *
 * Nothing else catches this. A typecheck sees `<Term id={string}>` and is
 * satisfied by any string; a build sees a component that falls back to the
 * raw key on a miss (`lib/i18n/resolve.ts`) and renders it anyway — a typo'd
 * id ships as visible mojibake rather than a build failure. The failure this
 * exists to catch: a `<Term id="...">` added to a landing page with no
 * matching entry in `messages/{en,id}/glossary.json`, the two locale catalogs
 * drifting apart (a term added to one and not the other), or a "short"
 * definition that grew past the one sentence the popup and the page both
 * assume.
 *
 * Run with `npm run verify:glossary`.
 */

import { readFileSync } from 'node:fs';
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

/** Every `<Term id="...">` occurrence in one landing page. */
function termIdsIn(relativePath: string): string[] {
  const source = readFileSync(join(ROOT, relativePath), 'utf8');
  return Array.from(source.matchAll(/<Term id="([a-z0-9-]+)"/g), m => m[1]);
}

/** A definition is meant to be one sentence — no internal sentence break before the final punctuation mark. */
function isOneSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!/[.!?]$/.test(trimmed)) return false;
  const body = trimmed.slice(0, -1);
  return !/[.!?]\s/.test(body);
}

console.log('landing-page term ids resolve');

const LANDING_PAGES = ['app/(en)/page.tsx', 'app/id/page.tsx'];
const catalogs: Record<string, GlossaryCatalog> = { en: readGlossary('en'), id: readGlossary('id') };

for (const page of LANDING_PAGES) {
  const ids = termIdsIn(page);
  if (ids.length === 0) {
    fail(`✗ ${page}: no <Term> markers found — is the marking still there?`);
    continue;
  }
  let allResolved = true;
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const id of ids) {
      if (!(id in catalog.terms)) {
        fail(`✗ ${page}: <Term id="${id}"> has no entry in messages/${locale}/glossary.json`);
        allResolved = false;
      }
    }
  }
  if (allResolved) pass(`✓ ${page}: all ${ids.length} marked term(s) resolve in both locales`);
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
