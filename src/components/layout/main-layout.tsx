'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { SidebarProvider } from './sidebar-context';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { ViewOnlyBanner } from './view-only-banner';
import { Preloader } from './preloader';

interface MainLayoutProps {
  children: React.ReactNode;
}

/** Pages anyone can open without signing in. */
function isPublicPage(pathname: string) {
  return pathname === '/home' || pathname === '/login' || pathname.startsWith('/auth/');
}

export function MainLayout({ children }: MainLayoutProps) {
  const { isAuthenticated, isLoading, refreshSession } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const publicPage = isPublicPage(pathname);

  // Opening another page re-checks the session (cheap, throttled): a session logged out
  // in Telegram ends here even when the page's data was preloaded.
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated || publicPage) return;
    if (lastPath.current !== null && lastPath.current !== pathname) refreshSession();
    lastPath.current = pathname;
  }, [pathname, isAuthenticated, publicPage, refreshSession]);

  // Logged out on an app page: go to the landing page (nothing from Canvas loads).
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !publicPage) {
      router.replace(`/home${window.location.search}`);
    }
  }, [isLoading, isAuthenticated, publicPage, router]);

  // Public pages draw right away; they don't need to know yet whether you're signed in.
  if (publicPage) return <>{children}</>;
  if (isLoading || !isAuthenticated) return <div className="min-h-screen bg-shell" />;

  // Logged in: grey frame, sidebar, and the page in a bordered panel.
  return (
    <SidebarProvider>
      <div className="min-h-screen bg-shell">
        <Sidebar />
        <div className="min-w-0 p-2 md:pl-[260px]">
          <div className="min-h-[calc(100vh-1rem)] min-w-0 overflow-hidden rounded-xl border border-shell-line bg-background">
            <Header />
            <ViewOnlyBanner />
            <main className="mx-auto min-w-0 max-w-[1040px] px-5 py-7 md:px-8 md:py-10">{children}</main>
          </div>
        </div>
        <Preloader />
      </div>
    </SidebarProvider>
  );
}
