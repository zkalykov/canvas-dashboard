'use client';

import { useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { ArrowSquareOutIcon, ClockCounterClockwiseIcon, LinkSimpleIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CanvasHtml } from '@/components/shared/canvas-html';
import { useFilePreview } from '@/components/files/file-preview-dialog';
import type { Assignment, Submission } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AttachmentList } from './attachment-list';
import { formatLateness, formatPoints } from './assignment-utils';

/** Every real attempt, newest first. Falls back to the submission itself when history is missing. */
export function submissionAttempts(submission: Submission | null | undefined): Submission[] {
  if (!submission) return [];
  const history = (submission.submission_history ?? []).filter(s => s.submitted_at || (s.attempt ?? 0) > 0);
  const attempts = history.length > 0 ? history : submission.submitted_at ? [submission] : [];
  return [...attempts].sort((a, b) => (b.attempt ?? 0) - (a.attempt ?? 0));
}

const TYPE_LABELS: Record<string, string> = {
  online_text_entry: 'Text entry',
  online_url: 'Website URL',
  online_upload: 'File upload',
  online_quiz: 'Quiz',
  media_recording: 'Media recording',
  discussion_topic: 'Discussion',
  basic_lti_launch: 'External tool',
  external_tool: 'External tool',
  student_annotation: 'Annotation',
};

function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">{children}</p>;
}

function AttemptContent({
  attempt,
  assignment,
  onPreview,
}: {
  attempt: Submission;
  assignment: Assignment;
  onPreview: ReturnType<typeof useFilePreview>['openPreview'];
}) {
  const attachments = attempt.attachments ?? [];
  const canvasLink = (
    <a href={assignment.html_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
      view it in Canvas
    </a>
  );

  switch (attempt.submission_type) {
    case 'online_text_entry':
      return attempt.body ? (
        <div className="max-h-[32rem] overflow-auto rounded-lg border bg-background/60 p-4 text-sm leading-relaxed">
          <CanvasHtml html={attempt.body} />
        </div>
      ) : (
        <Notice>This text entry is empty.</Notice>
      );
    case 'online_url':
      return attempt.url ? (
        <a
          href={attempt.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted"
        >
          <LinkSimpleIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium text-primary">{attempt.url}</span>
          <ArrowSquareOutIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </a>
      ) : (
        <Notice>No URL was saved with this attempt.</Notice>
      );
    case 'online_upload':
      return attachments.length > 0 ? (
        <AttachmentList attachments={attachments} onPreview={onPreview} />
      ) : (
        <Notice>No files are attached to this attempt.</Notice>
      );
    case 'online_quiz':
      return <Notice>Quiz attempt submitted. Your answers and results are in the quiz section below.</Notice>;
    case 'discussion_topic':
      return <Notice>Submitted by posting to the discussion.</Notice>;
    case 'basic_lti_launch':
    case 'external_tool':
      return <Notice>Submitted through an external tool. To see what you turned in, {canvasLink}.</Notice>;
    case 'media_recording':
      return <Notice>Media recording submitted. To play it, {canvasLink}.</Notice>;
    case 'student_annotation':
      return <Notice>Annotated document submitted. To see it, {canvasLink}.</Notice>;
    default:
      if (attachments.length > 0) return <AttachmentList attachments={attachments} onPreview={onPreview} />;
      if (attempt.body) return <CanvasHtml html={attempt.body} className="text-sm" />;
      return <Notice>Submitted. To see the details, {canvasLink}.</Notice>;
  }
}

/** "Your submission": the content the student turned in, with an attempt picker. */
export function MySubmission({ assignment, submission }: { assignment: Assignment; submission: Submission }) {
  const attempts = submissionAttempts(submission);
  const [selected, setSelected] = useState<number | null>(null);
  const { openPreview, previewDialog } = useFilePreview();

  if (attempts.length === 0) return null;

  const current = attempts.find(a => a.attempt === selected) ?? attempts[0];
  const isLatest = current === attempts[0];
  const hasScore = current.score !== null && current.score !== undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          Your submission
        </CardTitle>
        <CardDescription>
          {attempts.length > 1 ? `${attempts.length} attempts` : 'One attempt'}
          {current.submission_type && TYPE_LABELS[current.submission_type] ? ` · ${TYPE_LABELS[current.submission_type]}` : ''}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {attempts.length > 1 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Attempts">
            {attempts.map((a, index) => {
              const active = a === current;
              return (
                <Button
                  key={a.attempt ?? `idx-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => setSelected(a.attempt ?? null)}
                  className="shrink-0"
                >
                  {index === 0 && <ClockCounterClockwiseIcon className="h-3.5 w-3.5" />}
                  Attempt {a.attempt ?? attempts.length - index}
                  {a.submitted_at && (
                    <span className={cn('text-xs', active ? 'opacity-80' : 'text-muted-foreground')}>
                      {format(new Date(a.submitted_at), 'MMM d')}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {current.submitted_at && (
            <span>
              Submitted {format(new Date(current.submitted_at), "EEE, MMM d, yyyy 'at' h:mm a")}
            </span>
          )}
          {current.late && (
            <Badge variant="outline" className="border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300">
              {formatLateness(current.seconds_late)}
            </Badge>
          )}
          {!isLatest && <Badge variant="secondary">Earlier attempt</Badge>}
          {hasScore && (
            <Badge variant="secondary">
              Score {formatPoints(current.score)} / {formatPoints(assignment.points_possible)}
            </Badge>
          )}
        </div>

        <AttemptContent attempt={current} assignment={assignment} onPreview={openPreview} />
      </CardContent>
      {previewDialog}
    </Card>
  );
}
