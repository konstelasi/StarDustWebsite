import CodeBlock from '@/components/CodeBlock';
import DaemonBoard from '@/components/DaemonBoard';
import FieldLifecycle from '@/components/FieldLifecycle';
import Fit from '@/components/Fit';
import Footer from '@/components/Footer';
import Hero from '@/components/Hero';
import JoinSwamp from '@/components/JoinSwamp';
import Nav from '@/components/Nav';
import Section from '@/components/Section';
import Term from '@/components/Term';
import { buildHeroStage } from '@/lib/hero/stage';
import { DOCS } from '@/lib/links';
import SlotMirror from '@/components/SlotMirror';
import styles from './page.module.css';

const QUICKSTART = `docker compose up          # MySQL + bootstrap + seed + all four daemons
docker compose logs init   # the seeded query, already answered`;

const WIRE = `{
  "version": "1",
  "filter": {
    "op": "and",
    "args": [
      { "op": "eq", "field": { "model": "invoice", "name": "status" }, "value": "paid" },
      { "op": "gt", "field": { "model": "invoice", "name": "amount" }, "value": 100 },
      { "op": "is_not_null", "field": { "model": "invoice", "name": "due_date" } }
    ]
  }
}`;

const BOOTSTRAP = `use StarDust\\Config\\Config;
use StarDust\\StarDust;

$engine = new StarDust(new Config(pdo: $pdo));
$engine->bootstrap();   // idempotent, non-destructive

$model = $engine->schemaBuilder()->createModel(1, 'company', [
    new FieldDefinition('name',      'string', isFilterable: true),
    new FieldDefinition('employees', 'int',    isFilterable: true),
    new FieldDefinition('city',      'string'),
]);`;

// Built once, while the site is built. The simulator stays on the server and the
// hero gets plain data.
const HERO_STAGE = buildHeroStage();

export default function IdHome() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero stage={HERO_STAGE} />

        <Section
          id="mirror"
          title="Satu baris sumber utama, dicerminkan ke dalam indeks."
          lede={
            <>
              <Term id="payload">Payload</Term> JSON lengkap selalu merupakan{' '}
              <Term id="system-of-record">sistem catatan sumber</Term>. Field yang Anda tandai
              sebagai <Term id="filterable">dapat difilter</Term> secara tambahan dicerminkan ke
              kolom <Term id="slot">slot</Term> bertipe dan terindeks pada{' '}
              <Term id="extension-page">extension page</Term> 1:1, jadi filter membaca indeks
              asli, bukan memindai JSON. Edit payload di bawah, lalu write.
            </>
          }
        >
          <SlotMirror />
        </Section>

        <Section
          id="joins"
          layout="split"
          title="Setiap kondisi EAV adalah self-join lain."
          lede={
            <>
              Tabel atribut klasik membuat pertanyaan yang lebih spesifik menjadi lebih mahal, karena
              setiap atribut yang difilter memerlukan join-nya sendiri dan hasil antaranya harus
              dibawa melalui semuanya. StarDust melakukan join sekali untuk setiap{' '}
              <Term id="extension-page">page</Term> terindeks yang ditempati field model, bukan
              sekali untuk setiap kondisi. Selama field-field itu berada di page yang sama,
              hasilnya satu join, berapa pun kondisi yang Anda tumpuk.
            </>
          }
        >
          <JoinSwamp />
        </Section>

        <Section
          id="lifecycle"
          tone="raised"
          title="Dapat difilter adalah janji yang daemon jaga, bukan instan."
          lede={
            <>
              Menandai field sebagai <Term id="filterable">dapat difilter</Term> hanya mencatat
              permintaan, lalu langsung kembali. Dua <Term id="daemon">daemon</Term> latar
              belakang kemudian mengerjakan hal yang membuat penyaringan bisa dipakai. Sampai
              keduanya selesai, filter pada field itu ditolak, bukan dijalankan, dan jeda itulah
              yang perlu Anda rancang.
            </>
          }
        >
          <FieldLifecycle />
        </Section>

        <Section
          id="daemons"
          title="Empat daemon. Tidak ada broker di antara mereka."
          lede={
            <>
              Mereka tidak pernah berbicara langsung satu sama lain. Database adalah satu-satunya titik
              koordinasi, dengan klaim diambil melalui <code>FOR UPDATE SKIP LOCKED</code>, dan{' '}
              <Term id="watcher">Watcher</Term> adalah satu-satunya singleton, dipegang oleh
              advisory lock. Jalankan lebih banyak{' '}
              <Term id="reconciler">Reconciler</Term>, <Term id="liberator">Liberator</Term>, dan{' '}
              <Term id="chronicler">Chronicler</Term> untuk throughput. Hanya Watcher yang tetap
              satu-satunya.
            </>
          }
        >
          <DaemonBoard />
        </Section>

        <Section
          id="status"
          layout="split"
          title="Apakah Anda sebaiknya benar-benar menggunakan ini."
          lede={
            <>
              Rilis saat ini adalah <strong><code>0.3.0-alpha.1</code></strong>, penulisan ulang
              total (<Term id="vertical-schema-partitioning">Vertical Schema Partitioning</Term>)
              dari lini 0.2.x lama, tanpa API yang sama dengannya.{' '}
              <strong>Belum mencapai 1.0</strong>, dan API publik masih bisa berubah sebelum 0.3.0.
              Semua yang ada di bawah ini sudah diimplementasikan dan tercakup oleh test suite.
            </>
          }
        >
          <Fit />

          <dl className={styles.specs}>
            <div className={styles.spec}>
              <dt>PHP</dt>
              <dd>
                <strong>8.1+</strong>
                <em>diuji pada 8.1 sampai 8.4</em>
              </dd>
            </div>
            <div className={styles.spec}>
              <dt>Database</dt>
              <dd>
                <strong>MySQL 8.0.13+ · MariaDB 10.11+</strong>
                <em>atau Percona Server 8.0.13+</em>
              </dd>
            </div>
            <div className={styles.spec}>
              <dt>Dependensi runtime</dt>
              <dd>
                <strong>psr/log · psr/clock</strong>
                <em>hanya interface, tanpa framework dan tanpa ORM</em>
              </dd>
            </div>
            <div className={styles.spec}>
              <dt>Ditolak</dt>
              <dd>
                <strong className={styles.no}>MariaDB ≤ 10.6 · MySQL ≤ 5.7</strong>
                <em>menolak untuk memulai daripada merusak registry</em>
              </dd>
            </div>
          </dl>
        </Section>

        <Section
          id="start"
          title="Coba dengan satu perintah."
          lede={
            <>
              Menyalakan MySQL, mem-bootstrap skema, menyemai <Term id="model">model</Term>{' '}
              contoh, menjalankan query yang difilter, dan memulai keempat{' '}
              <Term id="daemon">daemon</Term>.
            </>
          }
        >
          <div className={styles.startGrid}>
            <CodeBlock code={QUICKSTART} lang="bash" title="coba" copyable />
            <CodeBlock code={BOOTSTRAP} lang="php" title="atau pasang ke aplikasi Anda" copyable />
          </div>

          <div className={styles.wire}>
            <div className={styles.wireText}>
              <h3>Filter juga datang sebagai JSON.</h3>
              <p>
                Gateway HTTP jarang menyimpan AST PHP. Wire format ini di-decode menjadi{' '}
                <Term id="filter-tree">filter tree</Term> tertutup yang sama, dengan dua belas
                operator, AND/OR/NOT penuh, taksonomi error dengan tiga belas kode, dan setiap
                penolakan membawa JSON Pointer ke node yang bermasalah.
                Ini disediakan sebagai JSON Schema normatif sehingga klien Anda dapat memvalidasi
                dalam bahasa apa pun.
              </p>
              <a className="btn" href={DOCS} target="_blank" rel="noreferrer">
                Baca dokumentasi lengkap ↗
              </a>
            </div>
            <CodeBlock code={WIRE} lang="json" title="QueryFilter v1" />
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
