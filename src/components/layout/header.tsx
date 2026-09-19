'use client';

import Link from 'next/link';
import { useSidebar } from './sidebar-context';

/** Phone-only top bar inside the page card: opens the sidebar. */
export function Header() {
  const { toggle } = useSidebar();

  return (
    <header className="flex h-14 items-center border-b border-shell-line px-4 md:hidden">
      <button
        onClick={toggle}
        className="rounded-full border border-shell-line px-4 py-1.5 text-sm font-medium"
        aria-label="Open navigation"
      >
        Menu
      </button>
      <Link href="/home" className="ml-2 text-sm font-semibold">
        Canvas
      </Link>
    </header>
  );
}
