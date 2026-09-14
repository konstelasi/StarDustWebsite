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

const title = 'StarDust untuk custom field multi-tenant — studi kasus';
const description =
  'Satu tenant SaaS, satu record kontak, satu field yang ditambahkan setelah aplikasi berjalan — seluruh alur StarDust ditelusuri berurutan, dengan backfill window yang benar-benar berjalan langsung.';

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/id/custom-fields/',
    languages: {
      en: '/custom-fields/',
      id: '/id/custom-fields/',
    },
  },
  openGraph: {
    title,
    description,
    type: 'website',
    url: '/id/custom-fields/',
    siteName: 'StarDust',
    locale: 'id_ID',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Studi Kasus Custom Field StarDust',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Studi Kasus Custom Field StarDust',
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

$next = $page->nextCursor; // dipakai untuk EntryQuery berikutnya; null = habis`;

export default function IdCustomFields() {
  return (
    <>
      <Nav />
      <main id="main">
        <Section
          id="problem"
          eyebrow="01 · masalahnya"
          title="Dua tenant, satu jenis record, dua bentuk berbeda."
          titleAs="h1"
          lede={
            <>
              Acme ingin mencatat <code>plan</code> dan <code>seats</code> di setiap kontak.
              Globex ingin <code>industry</code>, <code>contract_value</code> dan{' '}
              <code>renewal_date</code> pada jenis record yang sama. Tidak ada satu tabel yang
              cocok untuk keduanya sekaligus — sebuah <Term id="model">model</Term> di StarDust
              didefinisikan per <Term id="tenant">tenant</Term>, dan setiap{' '}
              <Term id="field">field</Term> di dalamnya adalah apa pun yang benar-benar dibutuhkan
              tenant itu.
            </>
          }
        >
          <TenantColumns />
        </Section>

        <Section
          id="define"
          eyebrow="02 · mendefinisikan field"
          title="Mencatat bentuk yang baru saja diminta pelanggan."
          lede={
            <>
              Sebuah field terdiri dari nama, <Term id="declared-type">declared type</Term> —
              string, int, numeric, atau datetime — dan satu flag. <code>company</code> dan{' '}
              <code>seats</code> ditandai <Term id="filterable">filterable</Term> sejak awal,
              karena tenant ini sudah tahu keduanya akan dicari; <code>plan</code> mulai sebagai
              JSON-only, karena saat ini belum ada yang meminta untuk memfilternya.
            </>
          }
        >
          <CodeBlock
            code={CREATE_MODEL}
            lang="php"
            title="mencatat bentuk model"
            copyable
            className={styles.codeBlock}
          />
        </Section>

        <Section
          id="store"
          eyebrow="03 · menyimpan satu kontak"
          title="Satu penulisan, satu baris, dua cara penyimpanan."
          lede={
            <>
              <Term id="payload">Payload</Term> lengkap selalu menjadi{' '}
              <Term id="system-of-record">system of record</Term>. Setiap field yang ditandai
              filterable juga dicerminkan ke kolom <Term id="slot">slot</Term> yang bertipe dan
              terindeks pada <Term id="extension-page">extension page</Term> — <code>plan</code>{' '}
              belum, sehingga ia hanya hidup di dalam payload.
            </>
          }
        >
          <div className={styles.stack}>
            <CodeBlock code={WRITE_ENTRY} lang="php" title="menulis satu kontak" copyable />
            <PayloadMirror />
          </div>
        </Section>

        <Section
          id="query"
          eyebrow="04 · menelusuri kontak"
          title="Difilter, diurutkan, dan dipaginasi — tidak pernah sekaligus semua."
          lede={
            <>
              Sebuah pembacaan membawa <Term id="filter-tree">filter tree</Term>, opsi{' '}
              <Term id="sort">sort</Term>, dan ukuran halaman, lalu mengembalikan{' '}
              <Term id="cursor">cursor</Term> alih-alih nomor halaman. Tidak ada &quot;menampilkan
              1–20 dari 1.204&quot; — Anda terus meminta halaman berikutnya sampai cursor-nya
              kembali <code>null</code>.
            </>
          }
        >
          <CodeBlock
            code={QUERY}
            lang="php"
            title="menelusuri kontak Acme"
            copyable
            className={styles.codeBlock}
          />
        </Section>

        <Section
          id="evolve"
          eyebrow="05 · pelanggan meminta lebih"
          title="Jam 3 sore hari Selasa, dan Acme ingin memfilter berdasarkan plan."
          lede={
            <>
              Ini satu-satunya bagian di halaman ini yang benar-benar berjalan. Menandai sebuah
              field <Term id="filterable">filterable</Term> adalah sebuah{' '}
              <Term id="promotion">promotion</Term> — ia mencatat niat dan langsung kembali, dan{' '}
              <Term id="backfill-window">backfill window</Term> di antara momen itu dan filter
              yang benar-benar berfungsi ditutup oleh dua <Term id="daemon">daemon</Term> di latar
              belakang: <Term id="watcher">Watcher</Term>, yang menyediakan kapasitas, dan{' '}
              <Term id="reconciler">Reconciler</Term>, yang mem-backfill baris yang sudah ada.
              Sampai keduanya selesai, filter yang menyebut field itu ditolak pada{' '}
              <Term id="pre-flight-rejection">pre-flight</Term> alih-alih diam-diam memindai JSON.
            </>
          }
        >
          <FieldRequestDemo />
        </Section>

        <Section
          id="limits"
          eyebrow="06 · yang akan Anda temui"
          title="Daftar jujur, bukan sorotan yang bagus-bagus saja."
          lede="Delapan hal yang memang sengaja tidak dilakukan StarDust. Tidak satu pun ini bug — rancang di sekitarnya, sebagaimana integrasi sungguhan harus melakukannya."
        >
          <LimitsTable
            items={[
              {
                title: 'Tidak ada COUNT, SUM, atau GROUP BY',
                body: (
                  <>
                    Pembacaan selalu mengembalikan baris, tidak pernah total. Jumlah per facet dan
                    &quot;menampilkan 1–20 dari 1.204&quot; bukan sesuatu yang bisa diminta.
                  </>
                ),
              },
              {
                title: 'Paginasi hanya lewat cursor',
                body: (
                  <>
                    Anda mendapat satu halaman baris beserta <Term id="cursor">cursor</Term> yang
                    buram, bukan nomor halaman. &quot;Muat lebih banyak&quot; berjalan;
                    &quot;lompat ke halaman 7&quot; tidak bisa.
                  </>
                ),
              },
              {
                title: 'Pencarian hanya prefix',
                body: (
                  <>
                    <code>prefix</code> hanya mencocokkan awal sebuah nilai — tidak ada pencarian
                    substring, tidak ada fuzzy matching, tidak ada peringkat relevansi.
                  </>
                ),
              },
              {
                title: 'Update mengganti seluruh record',
                body: (
                  <>
                    Tidak ada update sebagian. Field yang tidak disertakan akan dikosongkan, bukan
                    dibiarkan — baca dulu, gabungkan, baru tulis kembali.
                  </>
                ),
              },
              {
                title: 'Export tidak bisa difilter',
                body: (
                  <>
                    Sebuah <Term id="export-job">export</Term> selalu mencakup seluruh entri dalam
                    satu model. Filter belakangan jika hanya butuh sebagian.
                  </>
                ),
              },
              {
                title: 'Setiap model berdiri sendiri',
                body: (
                  <>
                    Tidak ada relasi, tidak ada join, dan tidak ada foreign key antar model.
                    Setiap entri adalah record datar berisi nilai skalar.
                  </>
                ),
              },
              {
                title: 'Hanya empat tipe field',
                body: (
                  <>
                    string, int, numeric, atau datetime. Tidak ada boolean, tidak ada enum, tidak
                    ada array — dan objek bersarang tidak bisa dijadikan filterable.
                  </>
                ),
              },
              {
                title: 'Filterable butuh waktu',
                body: 'Persis seperti yang baru saja ditunjukkan bagian 05: field yang baru ditandai filterable baru benar-benar berfungsi setelah daemon menyelesaikan pekerjaannya — dan daemon itu harus berjalan agar momen itu pernah tiba.',
              },
            ]}
          />
        </Section>

        <Section
          id="next"
          eyebrow="07 · lanjut ke mana"
          title="Dua cara untuk melangkah lebih jauh."
          lede="Halaman ini adalah satu cerita tetap. Playground adalah mesin yang sama dengan semua kontrol terbuka, dan glosarium adalah kosakata di balik keduanya."
        >
          <div className={styles.nextGrid}>
            <a className="btn" href="/id/playground/">
              Buka playground →
            </a>
            <a className="btn" href="/id/glossary/">
              Baca glosarium →
            </a>
            <a className="btn" href={DOCS} target="_blank" rel="noreferrer">
              Baca dokumentasi lengkap ↗
            </a>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
