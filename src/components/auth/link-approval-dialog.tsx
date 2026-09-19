'use client';

import { useEffect, useRef, useState } from 'react';
import { TelegramLogoIcon } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { TELEGRAM_BOT_URL } from './telegram-login-dialog';
import { ApprovalCard, type Access, type ApprovalPhase } from './approval-card';

/**
 * Opening a one-time Telegram link does not sign in by itself: the bot asks the user
 * to choose View only or Full access (or Deny), and this dialog waits for the answer.
 * Nothing else loads until then.
 */

function friendlyError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('expired')) return 'This link has expired. Login links work for 30 seconds.';
  if (text.includes('already used')) return 'This link was already used. Each link works once.';
  if (text.includes('invalid auth code')) return "This link isn't valid.";
  if (text.includes('telegram')) return "We couldn't send the approval message on Telegram. Please try again.";
  return "We couldn't reach the login server. Please try again.";
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const secondsLeft = (expiresAt: number) => Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
const inTwoMinutes = () => Date.now() + 120_000;

export function LinkApprovalDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const [phase, setPhase] = useState<ApprovalPhase>('checking');
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const started = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    // Development runs effects twice (mount, unmount, mount). A one-time code works
    // once, so the flow starts only the first time and keeps running across that
    // re-mount; it stops only when the dialog really closes.
    mounted.current = true;
    const stop = () => {
      mounted.current = false;
    };
    if (started.current) return stop;
    started.current = true;
    const cancelledNow = () => !mounted.current;

    (async () => {
      // 1. Hand the code to the portal, which asks for approval in Telegram.
      try {
        const res = await fetch('/api/auth/link/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = (await res.json().catch(() => ({}))) as { expiresAt?: string; error?: string };
        if (cancelledNow()) return;
        if (!res.ok) {
          setError(friendlyError(data.error ?? ''));
          setPhase('error');
          return;
        }
        setExpiresAt(data.expiresAt ? new Date(data.expiresAt).getTime() : inTwoMinutes());
      } catch {
        if (!cancelledNow()) {
          setError(friendlyError(''));
          setPhase('error');
        }
        return;
      }
      setPhase('waiting');

      // 2. Wait for View only / Full access / Deny.
      let failures = 0;
      while (!cancelledNow()) {
        await wait(2000);
        if (cancelledNow()) return;
        try {
          const res = await fetch('/api/auth/link/status', { cache: 'no-store' });
          const data = (await res.json()) as { status: string; access?: Access };
          if (data.status === 'pending') continue;
          if (data.status === 'approved') {
            setAccess(data.access === 'full' ? 'full' : 'view');
            setPhase('approved');
            // 3. Full load so the dashboard starts with the new session.
            await wait(900);
            window.location.href = '/';
            return;
          }
          if (data.status === 'denied') return setPhase('denied');
          if (data.status === 'expired') return setPhase('expired');
          throw new Error(data.status);
        } catch {
          failures += 1;
          if (failures >= 5) {
            setError(friendlyError(''));
            setPhase('error');
            return;
          }
        }
      }
    })();

    return stop;
  }, [code]);

  // Countdown while waiting.
  useEffect(() => {
    if (phase !== 'waiting' || expiresAt === null) return;
    const tick = () => setRemaining(secondsLeft(expiresAt));
    const id = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [phase, expiresAt]);

  const failed = phase === 'denied' || phase === 'expired' || phase === 'error';

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      {/* Stays open until approved (then the page redirects) or closed with the X:
          clicks outside and the Escape key don't dismiss it. */}
      <DialogContent
        className="gap-5 rounded-2xl p-6 sm:max-w-md"
        showCloseButton={phase !== 'approved'}
        onInteractOutside={event => event.preventDefault()}
        onEscapeKeyDown={event => event.preventDefault()}
      >
        <ApprovalCard
          phase={phase}
          access={access}
          remaining={remaining}
          errorText={error}
          titleAs={DialogTitle}
          descriptionAs={DialogDescription}
        />
        {(phase === 'waiting' || failed) && (
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-foreground text-[15px] font-medium text-background transition-opacity hover:opacity-85"
          >
            <TelegramLogoIcon className="h-5 w-5" />
            Open Telegram
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
