import type { Metadata } from 'next';
import Footer from '@/components/Footer';
import Glossary, { type GlossaryMessages } from '@/components/Glossary';
import Nav from '@/components/Nav';
import { loadMessages, type Locale } from '@/lib/i18n';

const locale: Locale = 'id';

export const metadata: Metadata = {
  title: 'Glosarium | StarDust',
  description:
    'Empat puluh empat istilah StarDust yang dijelaskan dalam bahasa sederhana, dari tenant dan payload hingga backfill window dan spread.',
  alternates: {
    canonical: '/id/glossary/',
    languages: {
      en: '/glossary/',
      id: '/id/glossary/',
    },
  },
  openGraph: {
    title: 'Glosarium | StarDust',
    description:
      'Empat puluh empat istilah StarDust yang dijelaskan dalam bahasa sederhana, dari tenant dan payload hingga backfill window dan spread.',
    url: '/id/glossary/',
    locale: 'id_ID',
  },
};

export default async function IdGlossary() {
  const messages = await loadMessages(locale);

  return (
    <>
      <Nav />
      <main id="main">
        <Glossary locale={locale} messages={messages.glossary as unknown as GlossaryMessages} />
      </main>
      <Footer />
    </>
  );
}
