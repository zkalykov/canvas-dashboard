import type { Metadata } from 'next';
import { LandingPage } from '@/components/auth/landing-page';
import { isManualLoginEnabled } from '@/lib/app-config';
import { SITE_TITLE } from '@/lib/site';

// Rendered on each request (still the same page for everyone), so MANUAL_MODE can be
// switched on the server without a rebuild.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  alternates: { canonical: '/home' },
  robots: { index: true, follow: true },
};

/** Public landing page (login + interactive demo). The same for everyone. */
export default function HomePage() {
  return <LandingPage manualLogin={isManualLoginEnabled()} />;
}
