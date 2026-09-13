import styles from './TenantColumns.module.css';

type FieldRow = { name: string; type: 'string' | 'int' | 'numeric' | 'datetime' };

const ACME: FieldRow[] = [
  { name: 'company', type: 'string' },
  { name: 'plan', type: 'string' },
  { name: 'seats', type: 'int' },
];

const GLOBEX: FieldRow[] = [
  { name: 'company', type: 'string' },
  { name: 'industry', type: 'string' },
  { name: 'contract_value', type: 'numeric' },
  { name: 'renewal_date', type: 'datetime' },
];

function TenantCard({ name, fields }: { name: string; fields: FieldRow[] }) {
  return (
    <div className={`panel ${styles.card}`}>
      <div className="panel-head">
        <span>{name}</span>
        <span className="tag tag-json">contact</span>
      </div>
      <div className={styles.rows}>
        {fields.map(f => (
          <div key={f.name} className={styles.row}>
            <span className={styles.name}>{f.name}</span>
            <span className={`tag tag-json ${styles.type}`}>{f.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Two tenants, the same record type, two different field sets.
 *
 * Purely illustrative — no `lib/sim/` import, no reducer, nothing here is
 * asserted anywhere. It exists to make the opening problem concrete before
 * any code appears: Acme's `contact` and Globex's `contact` share a name and
 * nothing else, and neither `ALTER TABLE` per tenant nor one shared
 * `custom_fields` JSON blob is a comfortable answer to that.
 */
export default function TenantColumns() {
  return (
    <div className={styles.grid}>
      <TenantCard name="Acme Corp" fields={ACME} />
      <TenantCard name="Globex" fields={GLOBEX} />
    </div>
  );
}
