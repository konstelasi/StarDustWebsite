import type { Metadata } from 'next';
import CodeBlock from '@/components/CodeBlock';
import FieldRequestDemo from '@/components/customfields/FieldRequestDemo';
import LimitsTable from '@/components/customfields/LimitsTable';
import PayloadMirror from '@/components/customfields/PayloadMirror';
import TenantColumns from '@/components/customfields/TenantColumns';
import Footer from '@/components/Footer';
import Nav from '@/components/Nav';
import Section from '@/components/Section';
import Term from '@/components/Term';
import { DOCS } from '@/lib/links';
import styles from './page.module.css';

/**
 * `canonical` and `openGraph.url` are overridden rather than inherited, the
 * same reason `app/(en)/playground/page.tsx` does it: the root layout points
 * both at `/`, and a second page inheriting them would declare itself a
 * duplicate of the landing page.
 */
const title = 'StarDust for multi-tenant custom fields — a worked example';
const description =
  'One SaaS tenant, one contact record, one field added after launch — the whole StarDust arc walked in order, with the promotion window running live.';

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/custom-fields/',
    languages: {
      en: '/custom-fields/',
      id: '/id/custom-fields/',
    },
  },
  openGraph: {
    title,
    description,
    type: 'website',
    url: '/custom-fields/',
    siteName: 'StarDust',
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'StarDust Custom Fields Walkthrough',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StarDust Custom Fields Walkthrough',
    description,
    images: ['/og-image.png'],
  },
};

const CREATE_MODEL = `use StarDust\\Schema\\FieldDefinition;

$schema = $stardust->schemaBuilder();

$contact = $schema->createModel(1, 'contact', [
    new FieldDefinition('company', 'string', isFilterable: true),
    new FieldDefinition('plan',    'string'),
    new FieldDefinition('seats',   'int', isFilterable: true),
]);`;

const WRITE_ENTRY = `use StarDust\\Write\\EntryPayload;

$stardust->write(new EntryPayload(
    tenantId: 1,
    modelId:  $contact->modelId,
    fields:   ['company' => 'Acme Corp', 'plan' => 'Growth', 'seats' => 42],
));`;

const QUERY = `use StarDust\\Filter\\Ast\\LeafNode;
use StarDust\\Read\\EntryQuery;
use StarDust\\Read\\SortSpec;
use StarDust\\Read\\SortDirection;

$page = $stardust->read(new EntryQuery(
    tenantId: 1,
    modelId:  $contact->modelId,
    filter:   LeafNode::local('company', 'prefix', 'Acme'),
    selectFields: ['company', 'plan', 'seats'],
    pageSize: 24,
    sort:     SortSpec::byField('seats', SortDirection::Desc),
));

foreach ($page->rows as $entry) {
    echo $entry->fields['company'];
}

$next = $page->nextCursor; // pass to the next EntryQuery; null = end`;

export default function CustomFields() {
  return (
    <>
      <Nav />
      <main id="main">
        <Section
          id="problem"
          eyebrow="01 · the problem"
          title="Two tenants, one record, two different shapes."
          titleAs="h1"
          lede={
            <>
              Acme wants to track <code>plan</code> and <code>seats</code> on a contact. Globex
              wants <code>industry</code>, <code>contract_value</code> and{' '}
              <code>renewal_date</code> on the same kind of record. There is no single{' '}
              <Term id="tenant">tenant</Term>-wide table that fits both — a <Term id="model">model</Term> in
              StarDust is defined per tenant, and each <Term id="field">field</Term> on it is
              whatever that tenant actually needs.
            </>
          }
        >
          <TenantColumns />
        </Section>

        <Section
          id="define"
          eyebrow="02 · define the fields"
          title="Registering a shape a customer just asked for."
          lede={
            <>
              A field is a name, a <Term id="declared-type">declared type</Term> — string, int,
              numeric or datetime — and a flag. <code>company</code> and <code>seats</code> are
              marked <Term id="filterable">filterable</Term> from the start, because this tenant
              already knows they will search on them; <code>plan</code> starts out JSON-only,
              because right now nobody has asked to filter on it.
            </>
          }
        >
          <CodeBlock
            code={CREATE_MODEL}
            lang="php"
            title="registering the shape"
            copyable
            className={styles.codeBlock}
          />
        </Section>

        <Section
          id="store"
          eyebrow="03 · store a contact"
          title="One write, one row, two kinds of storage."
          lede={
            <>
              The complete <Term id="payload">payload</Term> is always the{' '}
              <Term id="system-of-record">system of record</Term>. Every field marked filterable is
              additionally mirrored into a typed, indexed <Term id="slot">slot</Term> column on an{' '}
              <Term id="extension-page">extension page</Term> — <code>plan</code> is not, yet, so
              it lives in the payload alone.
            </>
          }
        >
          <div className={styles.stack}>
            <CodeBlock code={WRITE_ENTRY} lang="php" title="writing a contact" copyable />
            <PayloadMirror />
          </div>
        </Section>

        <Section
          id="query"
          eyebrow="04 · browse the contacts"
          title="Filtered, sorted, and paged — never all at once."
          lede={
            <>
              A read takes a <Term id="filter-tree">filter tree</Term>, an optional{' '}
              <Term id="sort">sort</Term>, and a page size, and hands back a{' '}
              <Term id="cursor">cursor</Term> instead of a page number. There is no
              &quot;showing 1–20 of 1,204&quot; — you keep asking for the next page until the
              cursor comes back <code>null</code>.
            </>
          }
        >
          <CodeBlock
            code={QUERY}
            lang="php"
            title="browsing Acme's contacts"
            copyable
            className={styles.codeBlock}
          />
        </Section>

        <Section
          id="evolve"
          eyebrow="05 · a customer asks for more"
          title="It's 3pm on a Tuesday, and Acme wants to filter by plan."
          lede={
            <>
              This is the one part of the page that actually runs. Marking a field{' '}
              <Term id="filterable">filterable</Term> is a <Term id="promotion">promotion</Term> —
              it records intent and returns immediately, and the{' '}
              <Term id="backfill-window">backfill window</Term> between that moment and a working
              filter is closed by two background <Term id="daemon">daemons</Term>: the{' '}
              <Term id="watcher">Watcher</Term>, which provisions capacity, and the{' '}
              <Term id="reconciler">Reconciler</Term>, which backfills existing rows. Until they
              catch up, a filter naming the field is refused at{' '}
              <Term id="pre-flight-rejection">pre-flight</Term> rather than silently scanning
              JSON.
            </>
          }
        >
          <FieldRequestDemo />
        </Section>

        <Section
          id="limits"
          eyebrow="06 · what you would hit"
          title="The honest list, not the highlight reel."
          lede="Eight things StarDust deliberately does not do. None of them are bugs — design around them, the way a real integration would have to."
        >
          <LimitsTable
            items={[
              {
                title: 'No COUNT, SUM, or GROUP BY',
                body: (
                  <>
                    Reads return rows, never a total. Facet counts and &quot;showing 1–20 of
                    1,204&quot; are not something you can ask for.
                  </>
                ),
              },
              {
                title: 'Pagination is cursor-only',
                body: (
                  <>
                    You get a page of rows and an opaque <Term id="cursor">cursor</Term>, never a
                    page number. &quot;Load more&quot; works; &quot;jump to page 7&quot; does not.
                  </>
                ),
              },
              {
                title: 'Search is prefix-only',
                body: (
                  <>
                    <code>prefix</code> matches the start of a value, nothing else — no substring
                    search, no fuzzy matching, no relevance ranking.
                  </>
                ),
              },
              {
                title: 'Updates replace the whole record',
                body: (
                  <>
                    There is no partial update. A field you omit is cleared, not left alone — read,
                    merge, then write back.
                  </>
                ),
              },
              {
                title: 'Exports cannot be filtered',
                body: (
                  <>
                    An <Term id="export-job">export</Term> always covers every entry in a model.
                    Filter downstream if you only need a subset.
                  </>
                ),
              },
              {
                title: 'Models are independent',
                body: (
                  <>
                    No relations, no joins, and no foreign keys between models. Every entry is a
                    flat record of scalar values.
                  </>
                ),
              },
              {
                title: 'Four field types, no more',
                body: (
                  <>
                    string, int, numeric, or datetime. No boolean, no enum, no arrays — and no
                    nested object can be made filterable.
                  </>
                ),
              },
              {
                title: 'Filterable takes a moment',
                body: 'Exactly what section 05 just showed: a newly filterable field works only once the daemons have caught up, and needs them running to ever get there at all.',
              },
            ]}
          />
        </Section>

        <Section
          id="next"
          eyebrow="07 · go deeper"
          title="Two ways to keep going."
          lede="This page is a fixed story. The playground is the same engine with every control unlocked, and the glossary is the vocabulary behind both."
        >
          <div className={styles.nextGrid}>
            <a className="btn" href="/playground/">
              Open the playground →
            </a>
            <a className="btn" href="/glossary/">
              Read the glossary →
            </a>
            <a className="btn" href={DOCS} target="_blank" rel="noreferrer">
              Read the full documentation ↗
            </a>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
