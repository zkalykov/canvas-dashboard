'use client';

import { useDiscussions, useCourses, useCourseColors } from '@/hooks/use-canvas';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatCircleIcon } from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { courseTitle } from '@/lib/course-name';

export function DiscussionsPage() {
  const { data: discussions, loading, error } = useDiscussions();
  const { data: courses } = useCourses();
  const { getColor } = useCourseColors();

  const getCourseName = (courseId: number) => {
    const course = courses?.find(c => c.id === courseId);
    return course ? courseTitle(course) : 'Course';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Discussions</h1>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Discussions</h1>
        <p className="text-muted-foreground">Failed to load discussions</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold flex items-center gap-2 tracking-tight">
        Discussions
      </h1>

      <Card>
        <CardContent className="pt-6">
          <ScrollArea className="h-[calc(100vh-220px)]">
            {!discussions || discussions.length === 0 ? (
              <p className="text-muted-foreground">No discussions</p>
            ) : (
              <div className="space-y-3">
                {discussions.map(discussion => (
                  <Link
                    href={`/courses/${discussion.course_id}/discussions/${discussion.id}`}
                    key={discussion.id}
                    className="w-full text-left block rounded-lg border p-4 transition-colors hover:bg-muted"
                  >
                    <div className="flex items-start gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={discussion.author?.avatar_image_url} />
                        <AvatarFallback>
                          {discussion.author?.display_name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getColor(discussion.course_id) }} />
                          <span className="text-xs text-muted-foreground">
                            {getCourseName(discussion.course_id)}
                          </span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(
                              new Date(discussion.last_reply_at || discussion.posted_at),
                              { addSuffix: true }
                            )}
                          </span>
                        </div>

                        <h3 className="font-semibold mb-1">{discussion.title}</h3>

                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <ChatCircleIcon className="h-3 w-3" />
                            {discussion.discussion_subentry_count} replies
                          </span>
                          {discussion.unread_count > 0 && (
                            <Badge variant="secondary">
                              {discussion.unread_count} unread
                            </Badge>
                          )}
                        </div>

                        {discussion.message && (
                          <div
                            className="text-sm text-muted-foreground line-clamp-2 mt-2"
                            dangerouslySetInnerHTML={{
                              __html: discussion.message.replace(/<[^>]*>/g, ' ').slice(0, 150)
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
