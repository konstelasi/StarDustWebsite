/**
 * Hold every locale catalog under `messages/` in lockstep.
 *
 * Nothing else catches this. `lib/i18n/resolve.ts`'s `createTranslator()`
 * returns the raw key unresolved on a miss rather than throwing, so a key
 * added to `messages/en/*.json` with no matching `messages/id/*.json` entry
 * ships as a visible `daemonRoom.activity.someNewKey` on the Indonesian site —
 * a silent runtime miss, not a build failure, and not a typecheck failure
 * either: `Messages` is `Record<string, MessageNode>`, untyped by design.
 * `verify-glossary.ts` checks exactly this for `glossary.json` alone; this is
 * the same check widened to every domain file, plus one `verify-glossary.ts`
 * does not attempt: a value's `{param}` placeholders have to match across
 * locales too, or a translation that drops one silently renders the literal
 * string `{claimed}` instead of interpolating it — and drops the *wrong* one
 * silently, since a translator fluent in the target language but not reading
 * source code has no reason to preserve a placeholder the sentence does not
 * need grammatically.
 *
 * **Both the locale list and the domain-file list are directory walks, not
 * hardcoded arrays** — the same "scan that only covers what someone
 * remembered to list stays green while a new one goes unchecked" trap
 * `verify-glossary.ts`'s own doc comment names, and the engine's
 * `EventVocabularyTest` names before that. A third locale or a tenth domain
 * file is covered the moment its directory or file exists, with no edit here.
 *
 * Run with `npm run verify:messages`.
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
const MESSAGES_DIR = join(ROOT, 'messages');

/** A JSON message tree: string leaves, arbitrarily nested objects above them. */
type MessageNode = string | { [key: string]: MessageNode };

function readJson(path: string): MessageNode {
  return JSON.parse(readFileSync(path, 'utf8')) as MessageNode;
}

/** Every leaf's dot path, flattened, in the order `Object.keys` visits them. */
function flatten(node: MessageNode, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === 'string') {
    out.set(prefix, node);
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

/** `{claimed}`, `{firstId}` … — the interpolation placeholders one string names. */
function placeholdersIn(value: string): string[] {
  return Array.from(value.matchAll(/\{(\w+)\}/g), m => m[1]).sort();
}

const locales = readdirSync(MESSAGES_DIR)
  .filter(entry => statSync(join(MESSAGES_DIR, entry)).isDirectory())
  .sort();

if (locales.length < 2) {
  fail(`✗ found ${locales.length} locale director(y/ies) under messages/ — nothing to compare`);
  console.log(failed ? '\nFAILED' : '\nall message checks green');
  process.exit(failed ? 1 : 0);
}

console.log(`locales: ${locales.join(', ')}`);
console.log('\ndomain files match across locales');

const domainsByLocale = new Map<string, string[]>();
for (const locale of locales) {
  domainsByLocale.set(
    locale,
    readdirSync(join(MESSAGES_DIR, locale))
      .filter(f => f.endsWith('.json'))
      .sort(),
  );
}

const [firstLocale, ...restLocales] = locales;
const canonicalDomains = domainsByLocale.get(firstLocale) ?? [];

for (const locale of restLocales) {
  const domains = domainsByLocale.get(locale) ?? [];
  const onlyFirst = canonicalDomains.filter(d => !domains.includes(d));
  const onlyThis = domains.filter(d => !canonicalDomains.includes(d));
  if (onlyFirst.length > 0) {
    fail(`✗ present only in messages/${firstLocale}/: ${onlyFirst.join(', ')}`);
  }
  if (onlyThis.length > 0) {
    fail(`✗ present only in messages/${locale}/: ${onlyThis.join(', ')}`);
  }
}
if (canonicalDomains.every(d => restLocales.every(l => domainsByLocale.get(l)?.includes(d)))) {
  pass(`✓ ${canonicalDomains.length} domain file(s), identical across ${locales.length} locales`);
}

console.log('\nkeys and placeholders match across locales');

for (const domain of canonicalDomains) {
  const flatByLocale = new Map<string, Map<string, string>>();
  for (const locale of locales) {
    flatByLocale.set(locale, flatten(readJson(join(MESSAGES_DIR, locale, domain))));
  }

  const canonical = flatByLocale.get(firstLocale) ?? new Map();
  const canonicalKeys = [...canonical.keys()].sort();
  let domainOk = true;

  for (const locale of restLocales) {
    const flat = flatByLocale.get(locale) ?? new Map();
    const keys = [...flat.keys()].sort();

    const onlyFirst = canonicalKeys.filter(k => !flat.has(k));
    const onlyThis = keys.filter(k => !canonical.has(k));
    if (onlyFirst.length > 0) {
      domainOk = false;
      fail(`✗ ${domain}: present only in ${firstLocale} — ${onlyFirst.join(', ')}`);
    }
    if (onlyThis.length > 0) {
      domainOk = false;
      fail(`✗ ${domain}: present only in ${locale} — ${onlyThis.join(', ')}`);
    }

    for (const key of canonicalKeys) {
      const a = canonical.get(key);
      const b = flat.get(key);
      if (a === undefined || b === undefined) continue; // already reported above

      const paramsA = placeholdersIn(a);
      const paramsB = placeholdersIn(b);
      if (JSON.stringify(paramsA) !== JSON.stringify(paramsB)) {
        domainOk = false;
        fail(
          `✗ ${domain}: ${key} interpolates {${paramsA.join(', ')}} in ${firstLocale} but {${paramsB.join(', ')}} in ${locale}`,
        );
      }
    }
  }

  if (domainOk) pass(`✓ ${domain}: ${canonicalKeys.length} key(s), identical shape in every locale`);
}

console.log(failed ? '\nFAILED' : '\nall message checks green');
process.exit(failed ? 1 : 0);
