import { AuthCodeLanding } from '@/components/auth/auth-code-landing';
import { isManualLoginEnabled } from '@/lib/app-config';

/** One-time login link from the Telegram bot (see AuthCodeLanding). */
export default async function AuthCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <AuthCodeLanding code={code} manualLogin={isManualLoginEnabled()} />;
}
