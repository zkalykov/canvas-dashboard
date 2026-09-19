'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ArrowSquareOutIcon, CircleNotchIcon, ClockIcon, FloppyDiskIcon, PaperPlaneRightIcon, SignOutIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { canvasErrorMessage } from '@/components/assignments/assignment-utils';
import { ViewOnlyNote } from '@/components/shared/view-only-note';
import { useAuth } from '@/lib/auth-context';
import { canvasApi } from '@/lib/canvas-api';
import type { QuizSubmissionQuestion } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  QuizQuestionCard,
  initialAnswer,
  isAnswered,
  isInfoOnly,
  isSupported,
  toApiAnswer,
  type AnswerValue,
} from './quiz-question';
import type { QuizAttemptSubmission, QuizDetails } from './quiz-types';

const AUTOSAVE_MS = 60_000;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Counts down to `endAt`, re-rendering once a second. */
function useRemaining(endAt: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endAt]);
  if (!endAt) return null;
  return new Date(endAt).getTime() - now;
}

/** One in-progress attempt of a classic quiz: answer, save, submit. */
export function QuizAttempt({
  courseId,
  quiz,
  submission,
  questions,
  accessCode,
  onFinished,
  onExit,
}: {
  courseId: number;
  quiz: QuizDetails;
  submission: QuizAttemptSubmission;
  questions: QuizSubmissionQuestion[];
  accessCode?: string;
  onFinished: (result: QuizAttemptSubmission) => void;
  onExit: () => void;
}) {
  const { isViewOnly } = useAuth();
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>(() =>
    Object.fromEntries(questions.map(q => [q.id, initialAnswer(q)]))
  );
  // question id -> edit counter, for answers changed since the last successful save
  const [dirty, setDirty] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const remaining = useRemaining(submission.end_at);
  const timeUp = remaining !== null && remaining <= 0;
  const lastMinute = remaining !== null && remaining > 0 && remaining <= 60_000;

  const params = useMemo(
    () => ({
      attempt: submission.attempt,
      validation_token: submission.validation_token ?? '',
      ...(accessCode ? { access_code: accessCode } : {}),
    }),
    [submission.attempt, submission.validation_token, accessCode]
  );

  const questionById = useMemo(() => new Map(questions.map(q => [q.id, q])), [questions]);

  const numbers = useMemo(() => {
    const map = new Map<number, number>();
    let n = 0;
    for (const q of questions) if (!isInfoOnly(q)) map.set(q.id, ++n);
    return map;
  }, [questions]);

  const answerable = questions.filter(q => !isInfoOnly(q));
  const answeredCount = answerable.filter(q => isAnswered(q, answers[q.id] ?? null)).length;
  const unanswered = answerable.length - answeredCount;
  const unsupported = answerable.filter(q => !isSupported(q));
  const unsupportedUnanswered = unsupported.filter(q => !isAnswered(q, null)).length;
  const dirtyCount = Object.keys(dirty).length;
  const busy = saving || submitting;

  const setAnswer = (id: number, value: AnswerValue) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
    setDirty(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  };

  /** Saves every changed answer. Returns false when Canvas rejected the save. */
  const save = async (): Promise<boolean> => {
    if (isViewOnly) return false;
    const snapshot = { ...dirty };
    const ids = Object.keys(snapshot).map(Number);
    if (ids.length === 0) return true;
    const payload = ids
      .map(id => {
        const q = questionById.get(id);
        return q && isSupported(q) ? { id, answer: toApiAnswer(q, answers[id] ?? null) } : null;
      })
      .filter((item): item is { id: number; answer: unknown } => item !== null);

    setSaving(true);
    setSaveError(null);
    try {
      if (payload.length > 0) await canvasApi.answerQuizQuestions(submission.id, params, payload);
      setDirty(prev => {
        const next = { ...prev };
        for (const id of ids) if (next[id] === snapshot[id]) delete next[id];
        return next;
      });
      setSavedAt(new Date());
      return true;
    } catch (err) {
      setSaveError(canvasErrorMessage(err, 'Your answers could not be saved.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Autosave in the background so a closed tab or expired session loses little work.
  const saveRef = useRef(save);
  const busyRef = useRef(busy);
  useEffect(() => {
    saveRef.current = save;
    busyRef.current = busy;
  });
  useEffect(() => {
    const timer = setInterval(() => {
      if (!busyRef.current) void saveRef.current();
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, []);

  // Warn before leaving the page with unsaved answers.
  useEffect(() => {
    if (dirtyCount === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirtyCount]);

  const submit = async () => {
    if (isViewOnly) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const saved = await save();
      // Past the time limit Canvas refuses new answers but still accepts the submission.
      if (!saved && !timeUp) {
        throw new Error('Your latest answers could not be saved, so the quiz was not submitted. Try again.');
      }
      const result: QuizAttemptSubmission | undefined = await canvasApi.completeQuizSubmission(
        courseId,
        quiz.id,
        submission.id,
        params
      );
      setConfirmOpen(false);
      onFinished(result ?? { ...submission, workflow_state: 'complete' });
    } catch (err) {
      setSubmitError(canvasErrorMessage(err, 'The quiz could not be submitted.'));
    } finally {
      setSubmitting(false);
    }
  };

  const saveAndExit = async () => {
    if (await save()) onExit();
  };

  const progress = answerable.length > 0 ? (answeredCount / answerable.length) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Summary + actions */}
      <Card className="gap-3 py-4">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">Attempt {submission.attempt}</p>
              <p className="text-xs text-muted-foreground">
                Started {format(new Date(submission.started_at), 'MMM d, h:mm a')}
                {submission.end_at && ` · Ends ${format(new Date(submission.end_at), 'MMM d, h:mm a')}`}
              </p>
            </div>
            {remaining !== null && (
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-sm font-semibold tabular-nums',
                  timeUp || lastMinute ? 'bg-destructive/10 text-destructive' : 'bg-muted'
                )}
                title="Time remaining"
              >
                <ClockIcon className="h-4 w-4" /> {timeUp ? '0:00' : formatRemaining(remaining)}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {answeredCount} of {answerable.length} answered
              </span>
              <span aria-live="polite">
                {saving
                  ? 'Saving…'
                  : dirtyCount > 0
                    ? `${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}`
                    : savedAt
                      ? `Saved at ${format(savedAt, 'h:mm:ss a')}`
                      : 'All answers saved'}
              </span>
            </div>
            <Progress value={progress} />
          </div>
        </CardContent>
      </Card>

      {(lastMinute || timeUp) && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {timeUp
              ? "Time is up. Submit now; Canvas may not accept new answers after the time limit."
              : 'Less than a minute left. Submit the quiz now so your answers count.'}
          </p>
        </div>
      )}

      {saveError && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <WarningCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{saveError}</p>
        </div>
      )}

      {unsupported.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between dark:text-amber-300">
          <p>
            {unsupported.length} question{unsupported.length === 1 ? '' : 's'} in this quiz can only be answered in
            Canvas. Save here first, then finish in Canvas.
          </p>
          <a
            href={quiz.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 font-medium underline-offset-4 hover:underline"
          >
            Open in Canvas <ArrowSquareOutIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {questions.length === 0 ? (
        <Card className="py-8">
          <CardContent className="text-center text-sm text-muted-foreground">
            This quiz has no questions you can answer here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {questions.map(q => (
            <QuizQuestionCard
              key={q.id}
              question={q}
              number={numbers.get(q.id) ?? null}
              value={answers[q.id] ?? null}
              onChange={value => setAnswer(q.id, value)}
              quizUrl={quiz.html_url}
              disabled={submitting || isViewOnly}
            />
          ))}
        </div>
      )}

      {/* Bottom actions */}
      <Card className="gap-3 py-4">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {unanswered === 0
              ? 'Every question has an answer.'
              : `${unanswered} question${unanswered === 1 ? '' : 's'} still unanswered.`}
          </p>
          {isViewOnly ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <ViewOnlyNote>View only: taking quizzes is turned off.</ViewOnlyNote>
              <Button variant="ghost" onClick={onExit}>
                <SignOutIcon className="h-4 w-4" /> Exit
              </Button>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" onClick={() => void saveAndExit()} disabled={busy}>
                <SignOutIcon className="h-4 w-4" /> Save and exit
              </Button>
              <Button variant="outline" onClick={() => void save()} disabled={busy || dirtyCount === 0}>
                {saving && !submitting ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <FloppyDiskIcon className="h-4 w-4" />}
                Save answers
              </Button>
              <Button
                onClick={() => {
                  setSubmitError(null);
                  setConfirmOpen(true);
                }}
                disabled={busy}
              >
                <PaperPlaneRightIcon className="h-4 w-4" /> Submit quiz
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Floating timer so a real time limit stays visible while scrolling */}
      {remaining !== null && (quiz.time_limit || remaining < 60 * 60_000) && (
        <div
          className={cn(
            'fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-sm font-semibold tabular-nums shadow-lg',
            timeUp || lastMinute ? 'border-destructive/40 bg-destructive text-white' : 'bg-background'
          )}
          aria-hidden
        >
          <ClockIcon className="h-4 w-4" /> {timeUp ? "Time's up" : formatRemaining(remaining)}
        </div>
      )}

      <Dialog open={confirmOpen && !isViewOnly} onOpenChange={open => !submitting && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit this quiz?</DialogTitle>
            <DialogDescription>
              You&apos;ve answered {answeredCount} of {answerable.length} question{answerable.length === 1 ? '' : 's'}.
              You can&apos;t change your answers after submitting.
            </DialogDescription>
          </DialogHeader>
          {(unanswered > 0 || unsupportedUnanswered > 0) && (
            <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              {unanswered > 0 && (
                <p>
                  {unanswered} question{unanswered === 1 ? ' is' : 's are'} unanswered.
                </p>
              )}
              {unsupportedUnanswered > 0 && (
                <p>
                  {unsupportedUnanswered} of them can only be answered in Canvas.
                </p>
              )}
            </div>
          )}
          {submitError && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <WarningCircleIcon className="mt-0.5 h-4 w-4 shrink-0" /> {submitError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Keep working
            </Button>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting && <CircleNotchIcon className="h-4 w-4 animate-spin" />}
              {submitting ? 'Submitting…' : 'Submit quiz'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
