'use client';

import { useAuth } from '@/lib/auth-context';

/** Top-of-page reminder for sessions approved as "View only" in Telegram. */
export function ViewOnlyBanner() {
  const { isViewOnly, logout } = useAuth();
  if (!isViewOnly) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-shell-line bg-muted/60 px-5 py-2 text-[13px] md:px-8">
      <span>
        <span className="font-medium">View only.</span>{' '}
        <span className="text-muted-foreground">You can see everything, but you can’t submit, post or change anything.</span>
      </span>
      <button onClick={() => logout()} className="font-medium underline-offset-4 hover:underline">
        Log in with full access
      </button>
    </div>
  );
}
