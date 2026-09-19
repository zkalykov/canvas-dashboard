import { EyeIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/** Shown in place of a form or action when the session is view only. */
export function ViewOnlyNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl bg-muted/70 px-4 py-3 text-[13px] text-muted-foreground', className)}>
      <EyeIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
