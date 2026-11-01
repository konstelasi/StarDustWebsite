/**
 * `stack` puts the lede under the title. `split` sets them side by side on
 * wide screens, which suits a short title over a longer explanation.
 * `raised` lifts the section onto a slightly lighter band, for the one or two
 * places a page wants to slow the reader down.
 */
export default function Section({
  id,
  title,
  titleAs: TitleTag = 'h2',
  lede,
  layout = 'stack',
  tone,
  children,
}: {
  id: string;
  title: React.ReactNode;
  titleAs?: 'h1' | 'h2';
  lede?: React.ReactNode;
  layout?: 'stack' | 'split';
  tone?: 'raised';
  children: React.ReactNode;
}) {
  return (
    <section className={tone === 'raised' ? 'section section-raised' : 'section'} id={id}>
      <div className="shell">
        <div className={layout === 'split' ? 'section-head section-head--split' : 'section-head'}>
          <TitleTag className="section-title">{title}</TitleTag>
          {lede && <p className="section-lede">{lede}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
