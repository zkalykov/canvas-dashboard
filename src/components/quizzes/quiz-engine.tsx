'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { ArrowCounterClockwiseIcon, ArrowSquareOutIcon, CheckCircleIcon, CircleNotchIcon, HourglassIcon, KeyIcon, LockSimpleIcon, PlayIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CanvasHtml } from '@/components/shared/canvas-html';
import { ViewOnlyNote } from '@/components/shared/view-only-note';
import { canvasErrorMessage, formatPoints } from '@/components/assignments/assignment-utils';
import { refreshSubmissionCaches } from '@/components/assignments/refresh-caches';
import { useQuiz } from '@/hooks/use-canvas';
import { useAuth } from '@/lib/auth-context';
import { CanvasApiError, canvasApi } from '@/lib/canvas-api';
import type { QuizSubmissionQuestion } from '@/lib/types';
import { QuizAttempt } from './quiz-attempt';
import { quizPoints, type QuizAttemptSubmission, type QuizDetails } from './quiz-types';

interface QuizEngineProps {
  courseId: number;
  quizId: number;
  onComplete?: () => void;
}

interface ActiveAttempt {
  submission: QuizAttemptSubmission;
  questions: QuizSubmissionQuestion[];
}

const QUIZ_TYPE_LABELS: Record<string, string> = {
  practice_quiz: 'Practice quiz',
  survey: 'Ungraded survey',
  graded_survey: 'Graded survey',
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  );
}

function OpenInCanvas({ href, label = 'Open in Canvas' }: { href: string; label?: string }) {
  return (
    <Button asChild variant="outline">
      <a href={href} target="_blank" rel="noopener noreferrer">
        <ArrowSquareOutIcon className="h-4 w-4" /> {label}
      </a>
    </Button>
  );
}

function isFinished(qs: QuizAttemptSubmission | null | undefined): boolean {
  return !!qs && (qs.workflow_state === 'complete' || qs.workflow_state === 'pending_review');
}

/**
 * Takes a classic Canvas quiz inside the dashboard: shows the quiz details,
 * starts or resumes an attempt, and submits it. New Quizzes have no student
 * API and are handled by the caller as external tools.
 */
export function QuizEngine({ courseId, quizId, onComplete }: QuizEngineProps) {
  const { data, loading: quizLoading, error: quizError, refetch: refetchQuiz } = useQuiz(courseId, quizId);
  const { isViewOnly } = useAuth();
  const quiz = data as QuizDetails | undefined;
  const latestKey = courseId && quizId ? `canvas_my_quiz_submission_${courseId}_${quizId}` : null;
  const {
    data: latest,
    error: latestError,
    isLoading: latestLoading,
    mutate: refetchLatest,
  } = useSWR<QuizAttemptSubmission | null>(
    latestKey,
    () => canvasApi.getMyQuizSubmission(courseId, quizId) as Promise<QuizAttemptSubmission | null>,
    { revalidateOnFocus: false, dedupingInterval: 60_000, errorRetryCount: 1 }
  );

  const [active, setActive] = useState<ActiveAttempt | null>(null);
  const [result, setResult] = useState<QuizAttemptSubmission | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (quizLoading || (latestLoading && !latest)) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (quizError || !quiz) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
          <WarningCircleIcon className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">This quiz couldn&apos;t be loaded</p>
            <p className="text-sm text-muted-foreground">
              {canvasErrorMessage(quizError, 'Canvas did not return the quiz details.')}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetchQuiz()}>
            <ArrowCounterClockwiseIcon className="h-4 w-4" /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const handleFinished = (qs: QuizAttemptSubmission) => {
    setActive(null);
    setResult(qs);
    void refetchLatest(qs, { revalidate: true });
    void refreshSubmissionCaches(courseId);
    onComplete?.();
  };

  if (active && !isViewOnly) {
    return (
      <QuizAttempt
        courseId={courseId}
        quiz={quiz}
        submission={active.submission}
        questions={active.questions}
        accessCode={accessCode || undefined}
        onFinished={handleFinished}
        onExit={() => {
          setActive(null);
          void refetchLatest();
        }}
      />
    );
  }

  const points = quizPoints(quiz);

  if (result) {
    const graded = result.workflow_state === 'complete';
    const score = result.score;
    const kept = result.kept_score;
    const hidden = quiz.hide_results === 'always';
    return (
      <Card className="border-green-500/30">
        <CardContent className="flex flex-col items-center gap-4 py-4 text-center">
          <CheckCircleIcon className="h-12 w-12 text-green-600 dark:text-green-400" />
          <div className="space-y-1">
            <h3 className="text-xl font-semibold">Quiz submitted</h3>
            <p className="text-sm text-muted-foreground">
              Attempt {result.attempt}
              {result.finished_at && ` · ${format(new Date(result.finished_at), "MMM d, yyyy 'at' h:mm a")}`}
            </p>
          </div>
          {!hidden && graded && score !== null && score !== undefined && (
            <div className="rounded-lg bg-muted/50 px-6 py-3">
              <p className="text-3xl font-bold tabular-nums">
                {formatPoints(score)}
                {points !== null && <span className="text-lg font-medium text-muted-foreground"> / {formatPoints(points)}</span>}
              </p>
              {kept !== null && kept !== undefined && kept !== score && (
                <p className="text-sm text-muted-foreground">Kept score: {formatPoints(kept)}</p>
              )}
            </div>
          )}
          {result.workflow_state === 'pending_review' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <HourglassIcon className="h-4 w-4" /> Some answers need to be graded by your instructor.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <OpenInCanvas href={quiz.html_url} label="See results on Canvas" />
            <Button variant="ghost" onClick={() => setResult(null)}>
              Back to quiz details
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Intro / details screen ----
  const inProgress = latest?.workflow_state === 'untaken' ? latest : null;
  const lastFinished = latest && isFinished(latest) ? latest : null;
  const allowedAttempts = quiz.allowed_attempts && quiz.allowed_attempts > 0 ? quiz.allowed_attempts : null;
  const usedAttempts = lastFinished ? lastFinished.attempt : inProgress ? inProgress.attempt - 1 : 0;
  const extra = latest?.extra_attempts ?? 0;
  const noAttemptsLeft =
    !inProgress &&
    (latest?.attempts_left === 0 || (allowedAttempts !== null && usedAttempts >= allowedAttempts + extra));
  const needsLockdown = !!quiz.require_lockdown_browser;
  const typeLabel = QUIZ_TYPE_LABELS[quiz.quiz_type];

  const begin = async (event?: FormEvent) => {
    event?.preventDefault();
    if (starting || isViewOnly) return;
    if (quiz.has_access_code && !accessCode.trim()) {
      setStartError('Enter the access code your instructor gave you.');
      return;
    }
    setStarting(true);
    setStartError(null);
    const code = quiz.has_access_code ? accessCode.trim() : undefined;
    try {
      let qs: QuizAttemptSubmission | null = inProgress;
      if (!qs) {
        try {
          qs = await canvasApi.startQuizSubmission(courseId, quizId, code);
        } catch (err) {
          // 409: an attempt is already in progress, so pick that one up instead.
          if (!(err instanceof CanvasApiError && err.status === 409)) throw err;
          const current = (await canvasApi.getMyQuizSubmission(courseId, quizId)) as QuizAttemptSubmission | null;
          if (!current || current.workflow_state !== 'untaken') throw err;
          qs = current;
        }
      }
      if (!qs.validation_token) {
        throw new Error("Canvas didn't return a session token for this attempt. Continue it in Canvas instead.");
      }
      const questions = await canvasApi.getQuizSubmissionQuestions(qs.id);
      setActive({ submission: qs, questions });
      void refetchLatest(qs, { revalidate: false });
    } catch (err) {
      setStartError(canvasErrorMessage(err, 'The quiz could not be started.'));
      void refetchLatest(); // the attempt may have ended elsewhere (e.g. time ran out)
    } finally {
      setStarting(false);
    }
  };

  let blocker: ReactNode = null;
  if (quiz.locked_for_user) {
    blocker = (
      <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm">
        <LockSimpleIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium">This quiz is locked</p>
          {quiz.lock_explanation ? (
            <CanvasHtml html={quiz.lock_explanation} className="text-muted-foreground" />
          ) : (
            <p className="text-muted-foreground">It isn&apos;t available right now.</p>
          )}
        </div>
      </div>
    );
  } else if (needsLockdown) {
    blocker = (
      <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
        <LockSimpleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <p>This quiz requires a lockdown browser, so it has to be taken in Canvas.</p>
      </div>
    );
  } else if (noAttemptsLeft) {
    blocker = (
      <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm">
        <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p>You&apos;ve used all your attempts for this quiz.</p>
      </div>
    );
  }

  const startLabel = inProgress ? 'Resume quiz' : lastFinished ? 'Retake quiz' : 'Start quiz';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          {quiz.title || 'Quiz'}
          {typeLabel && <Badge variant="secondary">{typeLabel}</Badge>}
        </CardTitle>
        <CardDescription>
          {inProgress
            ? `You have an attempt in progress (started ${format(new Date(inProgress.started_at), "MMM d 'at' h:mm a")}).`
            : 'Take this quiz right here. Your answers are saved to Canvas as you go.'}
          {quiz.time_limit && !inProgress ? ' The timer starts when you begin and keeps running if you leave.' : ''}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4 sm:grid-cols-4">
          <Fact label="Questions">{quiz.question_count ?? '–'}</Fact>
          <Fact label="Points">{points !== null ? formatPoints(points) : '–'}</Fact>
          <Fact label="Time limit">{quiz.time_limit ? `${quiz.time_limit} min` : 'None'}</Fact>
          <Fact label="Attempts">
            {allowedAttempts === null ? (
              <>
                {usedAttempts > 0 ? `${usedAttempts} used` : 'Unlimited'}
                {usedAttempts > 0 && <span className="text-muted-foreground"> · unlimited</span>}
              </>
            ) : (
              <>
                {usedAttempts} of {allowedAttempts + extra} used
              </>
            )}
          </Fact>
        </dl>

        {lastFinished && (
          <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">
                Last attempt ({lastFinished.attempt})
                {lastFinished.workflow_state === 'complete' &&
                  lastFinished.score !== null &&
                  lastFinished.score !== undefined &&
                  quiz.hide_results !== 'always' && (
                    <>
                      : {formatPoints(lastFinished.score)}
                      {points !== null && ` / ${formatPoints(points)}`}
                    </>
                  )}
              </p>
              <p className="text-muted-foreground">
                {lastFinished.finished_at && `Submitted ${format(new Date(lastFinished.finished_at), "MMM d, yyyy 'at' h:mm a")}`}
                {lastFinished.workflow_state === 'pending_review' && ' · waiting for manual grading'}
                {lastFinished.kept_score !== null &&
                  lastFinished.kept_score !== undefined &&
                  lastFinished.kept_score !== lastFinished.score &&
                  ` · kept score ${formatPoints(lastFinished.kept_score)}`}
              </p>
            </div>
            <a
              href={quiz.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
            >
              View results <ArrowSquareOutIcon className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {latestError && (
          <p className="text-sm text-muted-foreground">
            Your previous attempts couldn&apos;t be loaded ({canvasErrorMessage(latestError)}).
          </p>
        )}

        {blocker}

        {!blocker && isViewOnly && <ViewOnlyNote>View only: taking quizzes is turned off.</ViewOnlyNote>}

        {!blocker && !isViewOnly && quiz.has_access_code && (
          <form onSubmit={begin} className="max-w-sm space-y-1.5">
            <Label htmlFor={`access-code-${quiz.id}`} className="flex items-center gap-1.5">
              <KeyIcon className="h-4 w-4" /> Access code
            </Label>
            <Input
              id={`access-code-${quiz.id}`}
              value={accessCode}
              onChange={e => setAccessCode(e.target.value)}
              autoComplete="off"
              placeholder="Enter the code from your instructor"
            />
          </form>
        )}

        {startError && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <WarningCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{startError}</p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <OpenInCanvas href={quiz.html_url} />
        {!blocker && !isViewOnly && (
          <Button onClick={() => void begin()} disabled={starting}>
            {starting ? (
              <CircleNotchIcon className="h-4 w-4 animate-spin" />
            ) : lastFinished && !inProgress ? (
              <ArrowCounterClockwiseIcon className="h-4 w-4" />
            ) : (
              <PlayIcon className="h-4 w-4" />
            )}
            {starting ? 'Loading questions…' : startLabel}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
