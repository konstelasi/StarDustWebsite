import styles from './PayloadMirror.module.css';

/**
 * `slot` is a column name when the field is mirrored, `null` when it lives in
 * the payload alone, and absent on the braces, which carry no field.
 */
type Line = { depth: 0 | 1; text: string; slot?: string | null };

const LINES: Line[] = [
  { depth: 0, text: '{' },
  { depth: 1, text: '"company": "Acme Corp",', slot: 'i_str_01' },
  { depth: 1, text: '"plan": "Growth",', slot: null },
  { depth: 1, text: '"seats": 42', slot: 'i_int_01' },
  { depth: 0, text: '}' },
];

/**
 * One payload, with the slot column each of its lines was mirrored into.
 *
 * Static counterpart to the home page's `SlotMirror`: no editing and no
 * reducer, just the one row this page's story runs on. `plan` is shown
 * unmirrored on purpose. It is the field section 05 promotes live, so a
 * visitor who scrolls back up after that section sees the exact state this
 * one started from.
 */
export default function PayloadMirror() {
  return (
    <div className={`panel ${styles.mirror}`}>
      <div className="panel-head">
        <span>the payload, always complete</span>
        <span className="tag tag-json">entry_slots_page_1</span>
      </div>
      <div className={styles.rows}>
        {LINES.map(l => (
          <div key={l.text} className={styles.row}>
            <code className={l.depth === 1 ? styles.indent : styles.brace}>{l.text}</code>
            {l.slot === undefined ? null : l.slot === null ? (
              <span className="tag tag-json">JSON-only</span>
            ) : (
              <span className="tag tag-indexed">{l.slot}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
