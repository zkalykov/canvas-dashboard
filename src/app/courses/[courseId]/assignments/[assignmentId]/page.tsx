'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowCounterClockwiseIcon, ArrowLeftIcon, ArrowSquareOutIcon, CalendarBlankIcon, CalendarDotsIcon, ChatTextIcon, FileTextIcon, LockSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useAssignment, useCourseColors, useCourseName, useMySubmission } from '@/hooks/use-canvas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CanvasHtml } from '@/components/shared/canvas-html';
import { AssignmentSubmission } from '@/components/assignments/assignment-submission';
import { AssignmentStatusCard } from '@/components/assignments/assignment-status-card';
import { AssignmentRubric } from '@/components/assignments/assignment-rubric';
import { MySubmission, submissionAttempts } from '@/components/assignments/my-submission';
import { SubmissionComments } from '@/components/assignments/submission-comments';
import { canvasErrorMessage } from '@/components/assignments/assignment-utils';
import { QuizEngine } from '@/components/quizzes/quiz-engine';
import { CanvasApiError } from '@/lib/canvas-api';
import type { Assignment } from '@/lib/types';

const ONLINE_TYPES = ['online_text_entry', 'online_url', 'online_upload'];

/** Canvas includes `discussion_topic` on graded-discussion assignments. */
type AssignmentWithDiscussion = Assignment & { discussion_topic?: { id: number } | null };

function BackButton() {
  const router = useRouter();
  return (
    <Button variant="ghost" onClick={() => router.back()} className="-ml-3">
      <ArrowLeftIcon className="h-4 w-4" /> Back
    </Button>
  );
}

function SubmitElsewhere({ assignment }: { assignment: AssignmentWithDiscussion }) {
  const types = assignment.submission_types ?? [];
  const discussionId = assignment.discussion_topic?.id;

  if (types.includes('discussion_topic')) {
    return (
      <Card className="py-5">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 text-sm">
            <ChatTextIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Graded discussion</p>
              <p className="text-muted-foreground">You submit this by posting a reply in the discussion.</p>
            </div>
          </div>
          {discussionId ? (
            <Button asChild className="shrink-0">
              <Link href={`/courses/${assignment.course_id}/discussions/${discussionId}`}>Go to discussion</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="shrink-0">
              <a href={assignment.html_url} target="_blank" rel="noopener noreferrer">
                <ArrowSquareOutIcon className="h-4 w-4" /> Open in Canvas
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (types.some(t => ['media_recording', 'student_annotation'].includes(t))) {
    return (
      <Card className="py-5">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 text-sm">
            <ArrowSquareOutIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Submit this in Canvas</p>
              <p className="text-muted-foreground">
                {types.includes('media_recording') ? 'Media recordings' : 'Annotated documents'} can only be submitted
                on the Canvas website.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0">
            <a href={assignment.html_url} target="_blank" rel="noopener noreferrer">
              <ArrowSquareOutIcon className="h-4 w-4" /> Open in Canvas
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const message = types.includes('on_paper')
    ? 'Turn this assignment in on paper, as your instructor directs.'
    : types.includes('not_graded')
      ? 'This assignment is not graded and needs no submission.'
      : 'This assignment does not take an online submission.';
  return <div className="rounded-xl border bg-muted/40 p-6 text-center text-sm text-muted-foreground">{message}</div>;
}

function ExternalToolCard({ assignment }: { assignment: Assignment }) {
  const isQuiz = !!assignment.is_quiz_assignment;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {isQuiz ? 'This quiz opens in Canvas' : 'This assignment opens in Canvas'}
        </CardTitle>
        <CardDescription>
          {isQuiz
            ? 'It uses Canvas New Quizzes, which can only be taken on the Canvas website. Your status and grade still show up here.'
            : 'It uses an external tool that runs inside Canvas. Your status and grade still show up here once you finish.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <a href={assignment.html_url} target="_blank" rel="noopener noreferrer">
            <ArrowSquareOutIcon className="h-4 w-4" /> {isQuiz ? 'Take quiz in Canvas' : 'Open in Canvas'}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AssignmentDetailPage() {
  const params = useParams<{ courseId: string; assignmentId: string }>();
  const courseId = Number.parseInt(params.courseId, 10);
  const assignmentId = Number.parseInt(params.assignmentId, 10);

  const { data: assignment, loading, error, refetch: refetchAssignment } = useAssignment(courseId, assignmentId);
  const {
    data: mySubmission,
    loading: submissionLoading,
    refetch: refetchSubmission,
  } = useMySubmission(courseId, assignmentId);
  const { getColor } = useCourseColors();
  const courseName = useCourseName();

  const refreshAll = useCallback(
    () => Promise.all([refetchAssignment(), refetchSubmission()]),
    [refetchAssignment, refetchSubmission]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <BackButton />
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (error || !assignment) {
    const notFound = error instanceof CanvasApiError && (error.status === 404 || error.status === 403);
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <BackButton />
        <div className="flex flex-col items-center py-20 text-center">
          <FileTextIcon className="mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="text-xl font-semibold">{notFound ? 'Assignment not found' : "Couldn't load this assignment"}</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            {notFound
              ? "It may have been removed, or you don't have access to it."
              : canvasErrorMessage(error, 'Something went wrong while talking to Canvas.')}
          </p>
          {!notFound && (
            <Button variant="outline" className="mt-6" onClick={() => void refetchAssignment()}>
              <ArrowCounterClockwiseIcon className="h-4 w-4" /> Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  const types = assignment.submission_types ?? [];
  const submission = mySubmission ?? assignment.submission ?? null;
  const quizId = types.includes('online_quiz') ? assignment.quiz_id : undefined;
  const isClassicQuiz = !!quizId;
  const isExternalTool = types.includes('external_tool');
  const acceptsOnline = types.some(t => ONLINE_TYPES.includes(t));
  const attempts = submissionAttempts(mySubmission);
  const color = getColor(assignment.course_id);
  const unlockAt = assignment.unlock_at ? new Date(assignment.unlock_at) : null;
  const lockAt = assignment.lock_at ? new Date(assignment.lock_at) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <BackButton />

      {/* Header */}
      <header className="space-y-3">
        <Link
          href={`/courses/${assignment.course_id}`}
          className="flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate">{courseName(assignment.course_id)}</span>
        </Link>

        <h1 className="text-xl font-semibold break-words sm:text-2xl tracking-tight">{assignment.name}</h1>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {assignment.due_at ? (
            <span className="flex items-center gap-2">
              <CalendarBlankIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="mr-1 text-muted-foreground">Due</span>
                {format(new Date(assignment.due_at), 'EEE, MMM d, yyyy h:mm a')}
                <span className="ml-1 text-muted-foreground">
                  ({formatDistanceToNow(new Date(assignment.due_at), { addSuffix: true })})
                </span>
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <CalendarBlankIcon className="h-4 w-4 shrink-0" /> No due date
            </span>
          )}

          {(unlockAt || lockAt) && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <CalendarDotsIcon className="h-4 w-4 shrink-0" />
              {unlockAt && `Available ${format(unlockAt, 'MMM d, h:mm a')}`}
              {unlockAt && lockAt && ' – '}
              {lockAt && `${unlockAt ? '' : 'Available until '}${format(lockAt, 'MMM d, h:mm a')}`}
            </span>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {assignment.points_possible !== undefined && assignment.points_possible !== null && (
              <Badge variant="secondary">{assignment.points_possible} pts possible</Badge>
            )}
            {assignment.omit_from_final_grade && <Badge variant="outline">Doesn&apos;t count toward final grade</Badge>}
          </div>
        </div>
      </header>

      <AssignmentStatusCard assignment={assignment} submission={submission} loading={submissionLoading} />

      {assignment.locked_for_user && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          <LockSimpleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">This assignment is locked</p>
            {assignment.lock_explanation ? (
              <CanvasHtml html={assignment.lock_explanation} className="mt-1" />
            ) : (
              <p className="mt-1">It isn&apos;t available to you right now.</p>
            )}
          </div>
        </div>
      )}

      {assignment.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <CanvasHtml html={assignment.description} className="text-sm leading-relaxed sm:text-base" />
          </CardContent>
        </Card>
      )}

      {assignment.rubric && assignment.rubric.length > 0 && (
        <AssignmentRubric rubric={assignment.rubric} assessment={mySubmission?.rubric_assessment} />
      )}

      {mySubmission && !isClassicQuiz && attempts.length > 0 && (
        <MySubmission assignment={assignment} submission={mySubmission} />
      )}

      {/* How to submit */}
      <section className="space-y-3" aria-labelledby="submit-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="submit-heading" className="text-lg font-semibold">
            {isClassicQuiz ? 'Quiz' : 'Submission'}
          </h2>
          {types.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {types.map(type => (
                <Badge key={type} variant="outline" className="text-xs font-normal capitalize">
                  {type.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {quizId ? (
          <QuizEngine courseId={courseId} quizId={quizId} onComplete={() => void refreshAll()} />
        ) : isExternalTool ? (
          <ExternalToolCard assignment={assignment} />
        ) : acceptsOnline ? (
          <AssignmentSubmission assignment={assignment} submission={submission} onSubmitted={refreshAll} />
        ) : (
          <SubmitElsewhere assignment={assignment} />
        )}
      </section>

      {mySubmission ? (
        <SubmissionComments
          courseId={courseId}
          assignmentId={assignmentId}
          comments={mySubmission.submission_comments ?? []}
          showAttempts={attempts.length > 1}
          onPosted={refetchSubmission}
        />
      ) : submissionLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <WarningCircleIcon className="h-4 w-4" /> Comments couldn&apos;t be loaded.
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void refetchSubmission()}>
            Retry
          </Button>
        </div>
      )}

      <div className="pt-2">
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <a href={assignment.html_url} target="_blank" rel="noopener noreferrer">
            <ArrowSquareOutIcon className="h-4 w-4" /> View on Canvas
          </a>
        </Button>
      </div>
    </div>
  );
}
