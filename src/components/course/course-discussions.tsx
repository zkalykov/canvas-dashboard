'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { CaretRightIcon, ChatTextIcon } from '@phosphor-icons/react';
import { useDiscussions } from '@/hooks/use-canvas';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, ListSkeleton } from './course-ui';

export function CourseDiscussions({ courseId }: { courseId: number }) {
  const { data, loading, error, refetch } = useDiscussions();
  const topics = useMemo(() => (data ?? []).filter(topic => topic.course_id === courseId), [data, courseId]);

  if (loading) return <ListSkeleton rows={5} />;
  if (error) return <ErrorState error={error} subject="discussions" onRetry={() => refetch()} />;
  if (topics.length === 0) {
    return (
      <EmptyState
        icon={ChatTextIcon}
        title="No discussions yet"
        description="Discussion topics for this course will appear here."
      />
    );
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <ul className="divide-y">
        {topics.map(topic => {
          const lastActivity = topic.last_reply_at || topic.posted_at;
          const replies = topic.discussion_subentry_count ?? 0;
          const unreadTopic = topic.read_state === 'unread';
          return (
            <li key={topic.id}>
              <Link
                href={`/courses/${courseId}/discussions/${topic.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <ChatTextIcon
                  className={cn('h-4 w-4 shrink-0', unreadTopic ? 'text-foreground' : 'text-muted-foreground')}
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('break-words', unreadTopic ? 'font-semibold' : 'font-medium')}>
                      {topic.title}
                    </span>
                    {unreadTopic && <Badge variant="outline">New</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[
                      topic.author?.display_name,
                      `${replies} ${replies === 1 ? 'reply' : 'replies'}`,
                      lastActivity
                        ? `${topic.last_reply_at ? 'last reply' : 'posted'} ${formatDistanceToNow(new Date(lastActivity), { addSuffix: true })}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {topic.unread_count > 0 && (
                  <Badge className="tabular-nums" title={`${topic.unread_count} unread`}>
                    {topic.unread_count} unread
                  </Badge>
                )}
                <CaretRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
