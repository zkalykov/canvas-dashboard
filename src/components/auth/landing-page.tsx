'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { GithubLogoIcon, KeyIcon, TelegramLogoIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { TelegramLoginDialog } from './telegram-login-dialog';
import { TokenLoginDialog } from './token-login-dialog';
import { LinkApprovalDialog } from './link-approval-dialog';
import { useAuth } from '@/lib/auth-context';
import { GITHUB_URL } from '@/lib/site';

// The demo is big and its sample dates are relative to "now": load it in the browser,
// after the login part is already on screen.
const InteractiveDemo = dynamic(() => import('./demo/interactive-demo').then(m => m.InteractiveDemo), {
  ssr: false,
  loading: () => <DemoSkeleton />,
});

/** Same shape as the demo (sidebar + page panel), shown until it loads. Part of the static page. */
function DemoSkeleton() {
  const bar = 'rounded-md bg-muted';
  return (
    <div className="flex h-full bg-shell" aria-hidden="true">
      <div className="hidden w-[220px] shrink-0 flex-col px-3 pb-3 pt-5 md:flex">
        <p className="px-3 pb-5 text-[17px] font-semibold tracking-tight">Canvas</p>
        <div className="space-y-1">
          {[64, 88, 72, 60, 48, 56].map((width, i) => (
            <div key={i} className="flex h-9 items-center gap-3 px-3">
              <span className={'h-[17px] w-[17px] rounded-[5px] bg-shell-active'} />
              <span className={'h-3 rounded-md bg-shell-active'} style={{ width }} />
            </div>
          ))}
        </div>
        <p className="px-3 pb-1.5 pt-6 text-[12px] text-muted-foreground">Courses</p>
        {[96, 80, 104, 72].map((width, i) => (
          <div key={i} className="flex h-8 items-center gap-3 px-3">
            <span className="h-2 w-2 rounded-full bg-shell-active" />
            <span className={'h-3 rounded-md bg-shell-active'} style={{ width }} />
          </div>
        ))}
      </div>
      <div className="m-2 flex min-w-0 flex-1 flex-col gap-8 overflow-hidden rounded-xl border border-shell-line bg-background px-5 py-10 md:ml-0 md:px-10">
        <div className="mx-auto w-full max-w-[820px] space-y-8">
          <div className="space-y-3">
            <div className={cn(bar, 'h-7 w-40')} />
            <div className={cn(bar, 'h-7 w-72')} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[0, 1].map(i => (
              <div key={i} className="space-y-3 rounded-2xl border p-5">
                <div className={cn(bar, 'h-4 w-24')} />
                {[0, 1, 2, 3].map(j => (
                  <div key={j} className={cn(bar, 'h-10 w-full rounded-xl')} />
                ))}
              </div>
            ))}
          </div>
          <div className="space-y-3 rounded-2xl border p-5">
            <div className={cn(bar, 'h-4 w-20')} />
            {[0, 1, 2].map(j => (
              <div key={j} className={cn(bar, 'h-10 w-full rounded-xl')} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TelegramButton({ className, onClick }: { className?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-12 items-center gap-2.5 rounded-full bg-foreground px-6 text-[15px] font-medium text-background shadow-sm transition-opacity hover:opacity-85',
        className
      )}
    >
      <TelegramLogoIcon className="h-5 w-5" />
      Login via Telegram
    </button>
  );
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/**
 * Grows the demo from a framed preview (half-way down the first screen) to the full
 * window as the page scrolls, then keeps it pinned so it can be used. Styles are set
 * directly on the elements (no re-renders while scrolling).
 */
function useGrowOnScroll() {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frameId = 0;
    const update = () => {
      frameId = 0;
      const track = trackRef.current;
      const frame = frameRef.current;
      if (!track || !frame) return;
      const width = window.innerWidth;
      const progress = clamp(window.scrollY / Math.max(1, track.offsetTop));
      const eased = easeOut(progress);
      const startScale = Math.min(0.92, Math.min(width - 48, 1180) / width);
      frame.style.transform = `scale(${startScale + (1 - startScale) * eased})`;
      frame.style.borderRadius = `${18 * (1 - eased)}px`;
      frame.style.boxShadow = `0 -24px 60px -36px rgba(0,0,0,${0.35 * (1 - eased)})`;
      // Until it is full size, wheel/touch scrolling moves the page (not the demo's own lists).
      frame.dataset.live = progress >= 0.999 ? 'true' : 'false';
      const cta = ctaRef.current;
      if (cta) {
        const show = clamp((progress - 0.85) / 0.15);
        cta.style.opacity = String(show);
        cta.style.transform = `translateY(${12 * (1 - show)}px)`;
        cta.style.pointerEvents = show > 0.5 ? 'auto' : 'none';
      }
    };
    const schedule = () => {
      if (!frameId) frameId = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, []);

  return { trackRef, frameRef, ctaRef };
}

/**
 * Logged-out page: login on the first half of the screen, the dashboard below it.
 * Scrolling grows the dashboard to full size, and it becomes a clickable demo.
 */
/**
 * The page looks the same for everyone and on every refresh (it is static). Signed in
 * already? The login buttons simply open the dashboard instead of the login dialog.
 *
 * `manualLogin`: MANUAL_MODE from the server, passed in so the token button is part
 * of the static page. `linkCode`: opened from a one-time Telegram link
 * (/auth/<code>); the approval dialog pops up and waits for Telegram.
 */
export function LandingPage({ linkCode, manualLogin = false }: { linkCode?: string; manualLogin?: boolean }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [loginOpen, setLoginOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [pendingCode, setPendingCode] = useState(linkCode ?? null);
  const openLogin = () => (isAuthenticated ? router.push('/') : setLoginOpen(true));
  const openTokenLogin = () => (isAuthenticated ? router.push('/') : setTokenOpen(true));
  const { trackRef, frameRef, ctaRef } = useGrowOnScroll();

  return (
    <div className="min-h-dvh bg-shell">
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <span className="text-[19px] font-semibold tracking-tight">Canvas</span>
        <div className="flex items-center gap-1">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on GitHub"
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-medium transition-colors hover:bg-shell-hover sm:px-4"
          >
            <GithubLogoIcon className="h-[18px] w-[18px]" />
            <span className="hidden sm:inline">View on GitHub</span>
          </a>
          <button
            type="button"
            onClick={openLogin}
            className="rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors hover:bg-shell-hover"
          >
            Log in
          </button>
        </div>
      </header>

      <section className="flex flex-col items-center px-6 pb-[6vh] pt-[5vh] text-center">
        <h1 className="max-w-2xl text-[40px] font-semibold leading-[1.08] tracking-tight md:text-[56px]">Canvas, made simple.</h1>
        <p className="mt-4 max-w-md text-[17px] text-muted-foreground">
          Assignments, grades, files and messages from every course, in one calm place.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2.5">
          <TelegramButton className="w-full justify-center" onClick={openLogin} />
          {manualLogin && (
            <button
              type="button"
              onClick={openTokenLogin}
              className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-input bg-background text-[15px] font-medium transition-colors hover:bg-muted"
            >
              <KeyIcon className="h-5 w-5" />
              Login via Canvas token
            </button>
          )}
        </div>
        <p className="mt-12 text-[13px] text-muted-foreground">Scroll to try it</p>
      </section>

      {/* The dashboard: grows to full screen while scrolling, then stays pinned to try out */}
      <div ref={trackRef} className="relative h-[210vh]">
        <div className="sticky top-0 h-dvh overflow-hidden">
          <div ref={frameRef} data-live="false" className="group/demo h-full w-full origin-top overflow-hidden border border-shell-line will-change-transform">
            <InteractiveDemo />
          </div>
          <div ref={ctaRef} className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center opacity-0">
            <TelegramButton className="shadow-lg" onClick={openLogin} />
          </div>
        </div>
      </div>

      <section className="flex flex-col items-center px-6 py-24 text-center">
        <h2 className="text-[32px] font-semibold tracking-tight">Ready when you are.</h2>
        <p className="mt-2 max-w-md text-[15px] text-muted-foreground">Log in with Telegram. It takes about a minute.</p>
        <TelegramButton className="mt-6" onClick={openLogin} />
      </section>

      <footer className="px-6 pb-10 text-center text-[12px] text-muted-foreground">
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground/80 hover:text-foreground">
          Open source on GitHub
        </a>
        <p className="mt-1">Not affiliated with Instructure. Canvas is a trademark of Instructure, Inc.</p>
      </footer>

      <TelegramLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      {manualLogin && <TokenLoginDialog open={tokenOpen} onOpenChange={setTokenOpen} />}
      {pendingCode && <LinkApprovalDialog code={pendingCode} onClose={() => setPendingCode(null)} />}
    </div>
  );
}
