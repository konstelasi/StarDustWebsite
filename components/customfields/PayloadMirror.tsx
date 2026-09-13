import CodeBlock from '@/components/CodeBlock';
import styles from './PayloadMirror.module.css';

const PAYLOAD = `{
  "company": "Acme Corp",
  "plan": "Growth",
  "seats": 42
}`;

type MirrorRow = { field: string; slot: string | null };

const ROWS: MirrorRow[] = [
  { field: 'company', slot: 'i_str_01' },
  { field: 'seats', slot: 'i_int_01' },
  { field: 'plan', slot: null },
];

/**
 * One payload, and which of its fields actually got mirrored.
 *
 * Static counterpart to the home page's `SlotMirror` — no editing, no
 * reducer, just the one row this page's story runs on. `plan` is shown
 * unmirrored on purpose: it is the field section 05 promotes live, so a
 * visitor who scrolls back up after that section sees the exact state this
 * one started from.
 */
export default function PayloadMirror() {
  return (
    <div className={styles.grid}>
      <CodeBlock code={PAYLOAD} lang="json" title="the payload — always complete" />
      <div className="panel">
        <div className="panel-head">
          <span>entry_slots_page_1</span>
          <span className="tag tag-json">mirrored columns</span>
        </div>
        <div className={styles.rows}>
          {ROWS.map(r => (
            <div key={r.field} className={styles.row}>
              <span className={styles.field}>{r.field}</span>
              <span className={styles.arrow} aria-hidden="true">→</span>
              {r.slot === null ? (
                <span className="tag tag-json">JSON-only</span>
              ) : (
                <span className="tag tag-indexed">{r.slot}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
