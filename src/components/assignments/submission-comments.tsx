'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { format } from 'date-fns';
import { CircleNotchIcon, PaperPlaneRightIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFilePreview } from '@/components/files/file-preview-dialog';
import { ViewOnlyNote } from '@/components/shared/view-only-note';
import { useUser } from '@/hooks/use-canvas';
import { useAuth } from '@/lib/auth-context';
import { canvasApi } from '@/lib/canvas-api';
import type { SubmissionComment } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AttachmentList } from './attachment-list';
import { canvasErrorMessage } from './assignment-utils';

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

/** Comment thread on the student's submission, plus a box to add a comment. */
export function SubmissionComments({
  courseId,
  assignmentId,
  comments,
  showAttempts,
  onPosted,
}: {
  courseId: number;
  assignmentId: number;
  comments: SubmissionComment[];
  /** Tag each comment with its attempt number (useful when there are several attempts). */
  showAttempts?: boolean;
  onPosted: () => Promise<unknown> | void;
}) {
  const { data: user } = useUser();
  const { isViewOnly } = useAuth();
  const { openPreview, previewDialog } = useFilePreview();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...comments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const post = async () => {
    const comment = text.trim();
    if (!comment || posting) return;
    setPosting(true);
    setError(null);
    try {
      await canvasApi.addSubmissionComment(courseId, assignmentId, comment);
      setText('');
      await onPosted();
    } catch (err) {
      setError(canvasErrorMessage(err, 'Could not post your comment.'));
    } finally {
      setPosting(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void post();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void post();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          Comments
        </CardTitle>
        <CardDescription>
          {sorted.length === 0
            ? isViewOnly
              ? 'No comments yet.'
              : 'No comments yet. Questions for your instructor can go here.'
            : `${sorted.length} comment${sorted.length === 1 ? '' : 's'}`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {sorted.length > 0 && (
          <ol className="space-y-4">
            {sorted.map(comment => {
              const name = comment.author?.display_name || comment.author_name || 'Unknown';
              const mine = !!user && comment.author_id === user.id;
              return (
                <li key={comment.id} className="flex gap-3">
                  <Avatar className="mt-0.5">
                    {comment.author?.avatar_image_url && <AvatarImage src={comment.author.avatar_image_url} alt="" />}
                    <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      'min-w-0 flex-1 rounded-lg border p-3',
                      mine ? 'border-primary/20 bg-primary/5' : 'bg-muted/30'
                    )}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold">{mine ? `${name} (you)` : name}</span>
                      <time dateTime={comment.created_at} className="text-xs text-muted-foreground">
                        {format(new Date(comment.created_at), "MMM d, yyyy 'at' h:mm a")}
                      </time>
                      {showAttempts && comment.attempt ? (
                        <Badge variant="outline" className="text-[10px]">
                          Attempt {comment.attempt}
                        </Badge>
                      ) : null}
                    </div>
                    {comment.comment && (
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{comment.comment}</p>
                    )}
                    {comment.attachments && comment.attachments.length > 0 && (
                      <AttachmentList attachments={comment.attachments} onPreview={openPreview} className="mt-3" />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {isViewOnly ? (
          <ViewOnlyNote>View only: commenting is turned off.</ViewOnlyNote>
        ) : (
          <form onSubmit={onSubmit} className="space-y-2">
            <label htmlFor={`comment-${assignmentId}`} className="sr-only">
              Add a comment
            </label>
            <textarea
              id={`comment-${assignmentId}`}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Add a comment…"
              rows={3}
              disabled={posting}
              className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            />
            {error && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <WarningCircleIcon className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl/⌘ + Enter to post</span>
              <Button type="submit" size="sm" disabled={posting || !text.trim()} className="ml-auto">
                {posting ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <PaperPlaneRightIcon className="h-4 w-4" />}
                {posting ? 'Posting…' : 'Post comment'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
      {previewDialog}
    </Card>
  );
}
