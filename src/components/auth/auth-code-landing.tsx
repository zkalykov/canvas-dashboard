'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { LandingPage } from './landing-page';

/**
 * One-time login link from the Telegram bot: /auth/<code>.
 * Shows the landing page with the approval dialog on top; nothing is signed in
 * until the user approves in Telegram. Already signed in: straight to the dashboard.
 */
export function AuthCodeLanding({ code, manualLogin }: { code: string; manualLogin: boolean }) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) router.replace('/');
  }, [isAuthenticated, router]);

  if (isAuthenticated) return <div className="min-h-dvh bg-shell" />;
  return <LandingPage linkCode={code} manualLogin={manualLogin} />;
}
