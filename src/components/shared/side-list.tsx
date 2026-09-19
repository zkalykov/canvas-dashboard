'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Pick-one lists inside a page (courses on Grades and Files), styled like the main
 * sidebar: flat rows, a quiet filled row for the selected one, no box around them.
 */
export function SideList({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className={cn('h-fit space-y-0.5', className)}>
      {children}
    </nav>
  );
}

export function SideListHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('px-3 pb-1.5 pt-4 text-[13px] text-muted-foreground', className)}>{children}</p>;
}

export function SideListItem({
  active,
  onClick,
  title,
  leading,
  trailing,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex h-9 w-full min-w-0 items-center gap-3 rounded-lg px-3 text-left text-[14px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
        active ? 'bg-muted font-medium' : 'text-foreground/85 hover:bg-muted/70'
      )}
    >
      {leading}
      <span className={cn('min-w-0 flex-1 truncate', className)}>{children}</span>
      {trailing !== undefined && <span className="shrink-0 text-[13px] font-normal tabular-nums text-muted-foreground">{trailing}</span>}
    </button>
  );
}

/** The course color dot used in the sidebar. */
export function CourseDot({ color }: { color: string }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />;
}
