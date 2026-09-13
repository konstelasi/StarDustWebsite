import type { Metadata } from 'next';
import Footer from '@/components/Footer';
import Glossary, { type GlossaryMessages } from '@/components/Glossary';
import Nav from '@/components/Nav';
import { loadMessages, type Locale } from '@/lib/i18n';

const locale: Locale = 'en';

/**
 * `canonical` and `openGraph.url` are overridden rather than inherited, the
 * same reason `app/(en)/playground/page.tsx` does it: the root layout points
 * both at `/`, and a second page inheriting them would declare itself a
 * duplicate of the landing page.
 */
const title = 'StarDust glossary — the vocabulary behind the engine';
const description =
  'Forty-four StarDust terms defined in plain language, from tenant and payload to backfill window and spread.';

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/glossary/',
    languages: {
      en: '/glossary/',
      id: '/id/glossary/',
    },
  },
  openGraph: {
    title,
    description,
    type: 'website',
    url: '/glossary/',
    siteName: 'StarDust',
    locale: 'en_US',
    images: [
      {
        url: '/icon.svg',
        width: 1200,
        height: 630,
        alt: 'StarDust Glossary',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StarDust Glossary',
    description,
    images: ['/icon.svg'],
  },
};

export default async function GlossaryPage() {
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
