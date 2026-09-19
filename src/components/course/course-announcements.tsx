'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { CaretDownIcon, ChatTextIcon, MegaphoneSimpleIcon } from '@phosphor-icons/react';
import { useAnnouncements } from '@/hooks/use-canvas';
import type { Announcement } from '@/lib/types';
import { CanvasHtml } from '@/components/shared/canvas-html';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, ListSkeleton, canvasProseClass, stripHtml } from './course-ui';

export function CourseAnnouncements({ courseId }: { courseId: number }) {
  const { data, loading, error, refetch } = useAnnouncements();
  // null = nothing toggled yet, so the newest announcement starts open.
  const [openIds, setOpenIds] = useState<Set<number> | null>(null);

  const announcements = useMemo(
    () => (data ?? []).filter(a => a.context_code === `course_${courseId}`),
    [data, courseId]
  );

  if (loading) return <ListSkeleton rows={4} />;
  if (error) return <ErrorState error={error} subject="announcements" onRetry={() => refetch()} />;
  if (announcements.length === 0) {
    return (
      <EmptyState
        icon={MegaphoneSimpleIcon}
        title="No announcements"
        description="Announcements from the last six months will appear here."
      />
    );
  }

  const open = openIds ?? new Set(announcements.slice(0, 1).map(a => a.id));
  const toggle = (id: number) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenIds(next);
  };

  return (
    <div className="space-y-3">
      {announcements.map(announcement => (
        <AnnouncementCard
          key={announcement.id}
          courseId={courseId}
          announcement={announcement}
          open={open.has(announcement.id)}
          onToggle={() => toggle(announcement.id)}
        />
      ))}
    </div>
  );
}

function AnnouncementCard({
  courseId,
  announcement,
  open,
  onToggle,
}: {
  courseId: number;
  announcement: Announcement;
  open: boolean;
  onToggle: () => void;
}) {
  const author = announcement.author?.display_name ?? 'Instructor';
  const posted = announcement.posted_at ? new Date(announcement.posted_at) : null;
  const contentId = `announcement-${announcement.id}`;
  const unread = announcement.read_state === 'unread';

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={announcement.author?.avatar_image_url} alt="" />
          <AvatarFallback>{author.charAt(0)}</AvatarFallback>
        </Avatar>
        <span className="block min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="break-words font-semibold">{announcement.title}</span>
            {unread && <Badge>New</Badge>}
          </span>
          <span className="block text-xs text-muted-foreground">
            {author}
            {posted && (
              <>
                {' · '}
                <time dateTime={announcement.posted_at} title={format(posted, 'PPpp')}>
                  {format(posted, 'MMM d, yyyy')} ({formatDistanceToNow(posted, { addSuffix: true })})
                </time>
              </>
            )}
          </span>
          {!open && (
            <span className="line-clamp-2 text-sm text-muted-foreground">{stripHtml(announcement.message)}</span>
          )}
        </span>
        <CaretDownIcon
          className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
        />
      </button>

      {open && (
        <div id={contentId} className="space-y-4 border-t px-4 py-4 sm:pl-16">
          <CanvasHtml html={announcement.message} className={canvasProseClass} />
          <div className="flex justify-end">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/courses/${courseId}/discussions/${announcement.id}`}>
                <ChatTextIcon /> View replies
              </Link>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
