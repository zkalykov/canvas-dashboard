'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCourseColors, useCourseName, useDiscussionTopic } from '@/hooks/use-canvas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DiscussionThread } from '@/components/discussions/discussion-thread';
import { ArrowLeftIcon, ArrowSquareOutIcon, ChatTextIcon } from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';

export default function DiscussionDetailPage() {
  const params = useParams();
  const router = useRouter();

  const courseId = parseInt(params.courseId as string, 10);
  const discussionId = parseInt(params.discussionId as string, 10);

  const { data: topic, loading, error } = useDiscussionTopic(courseId, discussionId);
  const { getColor } = useCourseColors();
  const getCourseName = useCourseName();

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeftIcon className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-1/4" />
          <div className="pt-8 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="space-y-6 mx-auto max-w-5xl">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeftIcon className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="text-center py-20">
          <ChatTextIcon className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Discussion Not Found</h2>
          <p className="text-muted-foreground mt-2">We couldn&apos;t load this discussion.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10">
      <Button variant="ghost" onClick={() => router.back()} className="-ml-4 mb-2">
        <ArrowLeftIcon className="mr-2 h-4 w-4" /> Back
      </Button>

      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getColor(courseId) }} />
          <span className="text-sm font-medium text-muted-foreground">{getCourseName(courseId)}</span>
        </div>

        <h1 className="text-xl font-semibold tracking-tight">{topic.title}</h1>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={topic.author?.avatar_image_url} />
            <AvatarFallback>{topic.author?.display_name?.charAt(0) || '?'}</AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{topic.author?.display_name}</span>
            {topic.posted_at && (
              <>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(topic.posted_at), { addSuffix: true })}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {topic.unread_count > 0 && <Badge variant="secondary">{topic.unread_count} unread</Badge>}
            <Badge variant="outline" className="flex items-center gap-1">
              {topic.discussion_subentry_count} replies
            </Badge>
          </div>
        </div>
      </div>

      <DiscussionThread topic={{ ...topic, course_id: courseId }} />

      <div className="pt-6 border-t">
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <a href={topic.html_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center">
            <ArrowSquareOutIcon className="h-4 w-4 mr-2" />
            View Original on Canvas
          </a>
        </Button>
      </div>
    </div>
  );
}
