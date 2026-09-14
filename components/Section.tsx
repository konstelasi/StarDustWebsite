export default function Section({
  id,
  eyebrow,
  title,
  titleAs: TitleTag = 'h2',
  lede,
  children,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  titleAs?: 'h1' | 'h2';
  lede?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="section" id={id}>
      <div className="shell">
        <p className="eyebrow">{eyebrow}</p>
        <TitleTag className="section-title">{title}</TitleTag>
        {lede && <p className="section-lede">{lede}</p>}
        {children}
      </div>
    </section>
  );
}
