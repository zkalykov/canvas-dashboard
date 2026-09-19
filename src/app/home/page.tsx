import type { Metadata } from 'next';
import { LandingPage } from '@/components/auth/landing-page';
import { isManualLoginEnabled } from '@/lib/app-config';
import { SITE_TITLE } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  alternates: { canonical: '/home' },
  robots: { index: true, follow: true },
};

/** Public landing page (login + interactive demo). Static: the same for everyone. */
export default function HomePage() {
  return <LandingPage manualLogin={isManualLoginEnabled()} />;
}
