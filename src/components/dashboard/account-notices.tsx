'use client';

import { useState } from 'react';
import { CalendarDotsIcon, InfoIcon, QuestionIcon, WarningIcon, XCircleIcon, XIcon } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import canvasApi from '@/lib/canvas-api';
import { useAccountNotifications } from '@/hooks/use-canvas';
import { useAuth } from '@/lib/auth-context';
import { CanvasHtml } from '@/components/shared/canvas-html';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AccountNotification } from '@/lib/types';

const ICON_STYLE: Record<AccountNotification['icon'], { icon: PhosphorIcon; className: string; iconClass: string }> = {
  warning: {
    icon: WarningIcon,
    className: 'border-amber-500/40 bg-amber-500/10',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  error: {
    icon: XCircleIcon,
    className: 'border-destructive/40 bg-destructive/10',
    iconClass: 'text-destructive',
  },
  information: {
    icon: InfoIcon,
    className: 'border-blue-500/40 bg-blue-500/10',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  question: {
    icon: QuestionIcon,
    className: 'border-violet-500/40 bg-violet-500/10',
    iconClass: 'text-violet-600 dark:text-violet-400',
  },
  calendar: {
    icon: CalendarDotsIcon,
    className: 'border-border bg-muted/50',
    iconClass: 'text-muted-foreground',
  },
};

function isActive(notice: AccountNotification, now: number): boolean {
  const start = notice.start_at ? new Date(notice.start_at).getTime() : NaN;
  const end = notice.end_at ? new Date(notice.end_at).getTime() : NaN;
  if (!Number.isNaN(start) && start > now) return false;
  if (!Number.isNaN(end) && end < now) return false;
  return true;
}

/** School-wide notices from the Canvas account, shown as dismissible banners. */
export function AccountNotices() {
  const { data, error, refetch } = useAccountNotifications();
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());
  const [now] = useState(() => Date.now());
  const { isViewOnly } = useAuth();

  if (error || !data) return null;
  const notices = data.filter(n => !hidden.has(n.id) && isActive(n, now));
  if (notices.length === 0) return null;

  const dismiss = async (id: number) => {
    setHidden(prev => new Set(prev).add(id));
    try {
      await canvasApi.dismissAccountNotification(id);
      await refetch();
    } catch {
      // Canvas refused: bring the banner back so nothing silently disappears.
      setHidden(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-3" aria-label="School notices" role="region">
      {notices.map(notice => {
        const style = ICON_STYLE[notice.icon] ?? ICON_STYLE.information;
        const Icon = style.icon;
        return (
          <div key={notice.id} className={cn('flex items-start gap-3 rounded-xl border p-4', style.className)}>
            <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', style.iconClass)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{notice.subject}</p>
              <CanvasHtml
                html={notice.message}
                className="mt-1 text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline [&_p]:my-1"
              />
            </div>
            {!isViewOnly && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="-mr-1 -mt-1 shrink-0"
                onClick={() => dismiss(notice.id)}
                aria-label={`Dismiss notice: ${notice.subject}`}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
