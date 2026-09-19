'use client';

import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { CheckCircleIcon, CircleDashedIcon, ProhibitIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { assignmentState, isSubmitted } from '@/lib/submission-status';
import type { Assignment, Submission } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatLateness, formatPoints } from './assignment-utils';

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function StatusHeadline({ assignment, submission }: { assignment: Assignment; submission: Submission | null | undefined }) {
  const state = assignmentState({ due_at: assignment.due_at, submission });
  const graded = !!submission && submission.workflow_state === 'graded' && isSubmitted(submission);

  if (submission?.excused) {
    return (
      <span className="flex items-center gap-2 text-base font-semibold text-sky-600 dark:text-sky-400">
        <ProhibitIcon className="h-5 w-5" /> Excused
      </span>
    );
  }
  if (state === 'submitted') {
    return (
      <span className="flex items-center gap-2 text-base font-semibold text-green-600 dark:text-green-400">
        <CheckCircleIcon className="h-5 w-5" /> {graded ? 'Submitted and graded' : 'Submitted'}
      </span>
    );
  }
  if (state === 'missing') {
    return (
      <span className="flex items-center gap-2 text-base font-semibold text-destructive">
        <WarningCircleIcon className="h-5 w-5" /> Missing
      </span>
    );
  }
  if (state === 'overdue') {
    return (
      <span className="flex items-center gap-2 text-base font-semibold text-orange-600 dark:text-orange-400">
        <WarningIcon className="h-5 w-5" /> Not submitted · past due
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-base font-semibold">
      <CircleDashedIcon className="h-5 w-5 text-muted-foreground" /> Not submitted
    </span>
  );
}

/** Submission status, lateness, attempts and grade at a glance. */
export function AssignmentStatusCard({
  assignment,
  submission,
  loading,
}: {
  assignment: Assignment;
  submission: Submission | null | undefined;
  loading?: boolean;
}) {
  if (loading && !submission) {
    return (
      <Card className="py-5">
        <CardContent className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const submitted = isSubmitted(submission);
  const allowedAttempts = assignment.allowed_attempts && assignment.allowed_attempts > 0 ? assignment.allowed_attempts : null;
  const attempt = submission?.attempt ?? null;
  const hasScore = submission?.score !== null && submission?.score !== undefined;
  const pointsPossible = assignment.points_possible ?? 0;
  const grade = submission?.grade;
  const showGrade = !!grade && hasScore && grade !== String(submission?.score) && grade !== formatPoints(submission?.score);
  const deducted = submission?.points_deducted ?? 0;

  return (
    <Card className="py-5">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusHeadline assignment={assignment} submission={submission} />
          {submission?.late && (
            <Badge variant="outline" className="border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300">
              {formatLateness(submission.seconds_late)}
            </Badge>
          )}
          {submission?.missing && submitted && (
            <Badge variant="destructive">Marked missing</Badge>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Fact label="Submitted">
            {submission?.submitted_at ? (
              format(new Date(submission.submitted_at), 'MMM d, yyyy h:mm a')
            ) : (
              <span className="text-muted-foreground">Not yet</span>
            )}
          </Fact>

          <Fact label="Attempt">
            {attempt ? (
              <>
                {attempt}
                {allowedAttempts ? <span className="text-muted-foreground"> of {allowedAttempts}</span> : null}
              </>
            ) : (
              <span className="text-muted-foreground">
                {allowedAttempts ? `0 of ${allowedAttempts}` : 'None yet'}
              </span>
            )}
          </Fact>

          <Fact label="Score">
            {submission?.excused ? (
              <span className="text-muted-foreground">Excused</span>
            ) : hasScore ? (
              <>
                {formatPoints(submission?.score)}
                <span className="text-muted-foreground"> / {formatPoints(pointsPossible)}</span>
                {showGrade && <span className="ml-1.5 text-muted-foreground">({grade})</span>}
              </>
            ) : grade ? (
              grade
            ) : (
              <span className="text-muted-foreground">{submitted ? 'Not graded yet' : '–'}</span>
            )}
          </Fact>

          <Fact label={deducted > 0 ? 'Late penalty' : 'Graded'}>
            {deducted > 0 ? (
              <span className="text-orange-700 dark:text-orange-300">
                −{formatPoints(deducted)} pts
                {submission?.entered_score !== null && submission?.entered_score !== undefined && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {formatPoints(submission.entered_score)} before penalty
                  </span>
                )}
              </span>
            ) : submission?.graded_at && hasScore ? (
              format(new Date(submission.graded_at), 'MMM d, yyyy')
            ) : (
              <span className="text-muted-foreground">–</span>
            )}
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}
