'use client';

import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { canvasApi, CanvasApiError } from '@/lib/canvas-api';
import { useDiscussionThread } from '@/hooks/use-canvas';
import { useAuth } from '@/lib/auth-context';
import type { DiscussionTopic, DiscussionEntry } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CanvasHtml } from '@/components/shared/canvas-html';
import { ViewOnlyNote } from '@/components/shared/view-only-note';
import { formatDistanceToNow } from 'date-fns';
import { ArrowBendUpLeftIcon, ChatTextIcon, CircleNotchIcon, LockSimpleIcon, ThumbsUpIcon } from '@phosphor-icons/react';

interface DiscussionThreadProps {
  topic: DiscussionTopic;
}

function countEntries(entries: DiscussionEntry[]): number {
  return entries.reduce((sum, e) => sum + 1 + countEntries(e.replies ?? []), 0);
}

export function DiscussionThread({ topic }: DiscussionThreadProps) {
  const { data: thread, loading, error, refetch } = useDiscussionThread(topic.course_id, topic.id);
  const markedRead = useRef(false);
  const { isViewOnly } = useAuth();

  // Canvas marks a topic and its posts read when you view them; do the same once the
  // thread loads (not in view-only sessions). Covers announcements with no replies too.
  useEffect(() => {
    if (isViewOnly || !thread || markedRead.current) return;
    if (topic.read_state !== 'unread' && thread.unreadEntryIds.length === 0) return;
    markedRead.current = true;
    canvasApi
      .markDiscussionTopicRead(topic.course_id, topic.id)
      .then(() =>
        mutate(
          key =>
            key === 'canvas_discussions' ||
            key === 'canvas_announcements' ||
            key === `canvas_topic_${topic.course_id}_${topic.id}` ||
            key === `canvas_thread_${topic.course_id}_${topic.id}`
        )
      )
      .catch(() => {
        // Not critical: the unread badges just stay until the next visit.
      });
  }, [isViewOnly, thread, topic.course_id, topic.id, topic.read_state]);

  const refresh = async () => {
    await refetch();
    await mutate('canvas_discussions');
  };

  const mustPostFirst =
    error instanceof CanvasApiError && error.status === 403 && (error.details ?? '').includes('require_initial_post');

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <CircleNotchIcon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const entries = thread?.entries ?? [];
  const unread = new Set(thread?.unreadEntryIds ?? []);

  return (
    <div className="space-y-6 mt-6">
      <div className="border-b pb-6 mb-6">
        <CanvasHtml html={topic.message} className="text-sm" />
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <ChatTextIcon className="h-5 w-5" />
          Replies {thread && `(${countEntries(entries)})`}
        </h3>

        {isViewOnly ? (
          <ViewOnlyNote>View only: replying is turned off.</ViewOnlyNote>
        ) : (
          <ReplyBox courseId={topic.course_id} topicId={topic.id} onSuccess={refresh} />
        )}

        {mustPostFirst ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <LockSimpleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              Your instructor requires you to post before you can see other replies.
              {!isViewOnly && ' Post your reply above, then they will appear here.'}
            </p>
          </div>
        ) : error ? (
          <div className="text-center py-6 text-destructive text-sm">Failed to load replies: {error.message}</div>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground text-sm italic pt-4">No replies yet.{!isViewOnly && ' Be the first!'}</p>
        ) : (
          <div className="space-y-6 mt-8">
            {entries.map(entry => (
              <DiscussionEntryNode
                key={entry.id}
                entry={entry}
                courseId={topic.course_id}
                topicId={topic.id}
                unread={unread}
                onRefresh={refresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiscussionEntryNode({
  entry,
  courseId,
  topicId,
  unread,
  onRefresh,
  depth = 0,
}: {
  entry: DiscussionEntry;
  courseId: number;
  topicId: number;
  unread: Set<number>;
  onRefresh: () => Promise<void>;
  depth?: number;
}) {
  const [isReplying, setIsReplying] = useState(false);
  const { isViewOnly } = useAuth();
  const isDeleted = entry.deleted || !entry.message || entry.message.trim() === '';
  const isUnread = unread.has(entry.id);

  return (
    <div className={`flex gap-3 pt-2 ${depth > 0 ? 'mt-4 border-l-2 pl-4 ml-2 border-primary/10' : ''}`}>
      <Avatar className="h-8 w-8 mt-1 shrink-0">
        <AvatarImage src={entry.user?.avatar_image_url} />
        <AvatarFallback>{entry.user_name?.charAt(0) || '?'}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-medium text-sm">{isDeleted ? 'Deleted' : entry.user_name || 'Anonymous User'}</span>
          {entry.created_at && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
            </span>
          )}
          {isUnread && (
            <Badge variant="default" className="h-5 px-1.5 text-[10px]">
              New
            </Badge>
          )}
          {!!entry.rating_sum && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ThumbsUpIcon className="h-3 w-3" /> {entry.rating_sum}
            </span>
          )}
        </div>

        {isDeleted ? (
          <p className="text-sm italic text-muted-foreground bg-muted p-2 rounded-md">This message was deleted.</p>
        ) : (
          <CanvasHtml html={entry.message} className="text-sm bg-muted/30 p-3 rounded-md mb-2" />
        )}

        {!isDeleted && !isViewOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsReplying(!isReplying)}
          >
            <ArrowBendUpLeftIcon className="h-3 w-3 mr-1" />
            Reply
          </Button>
        )}

        {isReplying && !isViewOnly && (
          <div className="mt-2 mb-4">
            <ReplyBox
              courseId={courseId}
              topicId={topicId}
              entryId={entry.id}
              onSuccess={async () => {
                setIsReplying(false);
                await onRefresh();
              }}
            />
          </div>
        )}

        {entry.replies && entry.replies.length > 0 && (
          <div className="mt-2 space-y-4">
            {entry.replies.map(reply => (
              <DiscussionEntryNode
                key={reply.id}
                entry={reply}
                courseId={courseId}
                topicId={topicId}
                unread={unread}
                onRefresh={onRefresh}
                depth={depth + 1}
              />
            ))}
          </div>
        )}

        {entry.has_more_replies && (
          <p className="mt-2 text-xs text-muted-foreground">More replies are available on Canvas.</p>
        )}
      </div>
    </div>
  );
}

function ReplyBox({
  courseId,
  topicId,
  entryId,
  onSuccess,
}: {
  courseId: number;
  topicId: number;
  entryId?: number;
  onSuccess: () => void | Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!message.trim()) return;

    try {
      setSubmitting(true);
      setError(null);
      // Canvas expects HTML; keep line breaks from the plain textarea.
      const html = message
        .trim()
        .split(/\n{2,}/)
        .map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`)
        .join('');
      await canvasApi.postDiscussionReply(courseId, topicId, html, entryId);
      setMessage('');
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 mt-2 border rounded-md p-3 bg-background">
      <textarea
        className="w-full min-h-[80px] bg-transparent text-sm resize-y outline-none placeholder:text-muted-foreground"
        placeholder={entryId ? 'Write a reply...' : 'Start a new thread...'}
        value={message}
        onChange={e => setMessage(e.target.value)}
        disabled={submitting}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSubmit} disabled={!message.trim() || submitting}>
          {submitting ? (
            <>
              <CircleNotchIcon className="h-3 w-3 mr-2 animate-spin" /> Posting...
            </>
          ) : (
            'Post Reply'
          )}
        </Button>
      </div>
    </div>
  );
}
