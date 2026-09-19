'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowCounterClockwiseIcon, ArrowLeftIcon, ArrowSquareOutIcon, CalendarBlankIcon, CircleNotchIcon, ClipboardTextIcon } from '@phosphor-icons/react';
import { useCourseColors, useCourseName, useQuiz } from '@/hooks/use-canvas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CanvasHtml } from '@/components/shared/canvas-html';
import { canvasErrorMessage } from '@/components/assignments/assignment-utils';
import { QuizEngine } from '@/components/quizzes/quiz-engine';
import type { QuizDetails } from '@/components/quizzes/quiz-types';
import { CanvasApiError } from '@/lib/canvas-api';

function BackButton() {
  const router = useRouter();
  return (
    <Button variant="ghost" onClick={() => router.back()} className="-ml-3">
      <ArrowLeftIcon className="h-4 w-4" /> Back
    </Button>
  );
}

/**
 * Quiz route used by module items and Canvas links. Graded quizzes live on their
 * assignment page, so this redirects there; practice quizzes and ungraded
 * surveys are taken right here.
 */
export default function QuizPage() {
  const params = useParams<{ courseId: string; quizId: string }>();
  const router = useRouter();
  const courseId = Number.parseInt(params.courseId, 10);
  const quizId = Number.parseInt(params.quizId, 10);

  const { data, loading, error, refetch } = useQuiz(courseId, quizId);
  const quiz = data as QuizDetails | undefined;
  const { getColor } = useCourseColors();
  const courseName = useCourseName();
  const assignmentId = quiz?.assignment_id;

  useEffect(() => {
    if (assignmentId) router.replace(`/courses/${courseId}/assignments/${assignmentId}`);
  }, [assignmentId, courseId, router]);

  if (loading || assignmentId) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <BackButton />
        {assignmentId ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleNotchIcon className="h-4 w-4 animate-spin" /> Opening the quiz assignment…
          </p>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        )}
      </div>
    );
  }

  if (error || !quiz) {
    const notFound = error instanceof CanvasApiError && (error.status === 404 || error.status === 403);
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <BackButton />
        <div className="flex flex-col items-center py-20 text-center">
          <ClipboardTextIcon className="mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="text-xl font-semibold">{notFound ? 'Quiz not found' : "Couldn't load this quiz"}</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            {notFound
              ? "It may be unpublished, or you don't have access to it."
              : canvasErrorMessage(error, 'Something went wrong while talking to Canvas.')}
          </p>
          {!notFound && (
            <Button variant="outline" className="mt-6" onClick={() => void refetch()}>
              <ArrowCounterClockwiseIcon className="h-4 w-4" /> Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <BackButton />

      <header className="space-y-3">
        <Link
          href={`/courses/${courseId}`}
          className="flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getColor(courseId) }} />
          <span className="truncate">{courseName(courseId)}</span>
        </Link>
        <h1 className="text-xl font-semibold break-words sm:text-2xl tracking-tight">{quiz.title}</h1>
        {quiz.due_at && (
          <p className="flex items-center gap-2 text-sm">
            <CalendarBlankIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Due</span>
            {format(new Date(quiz.due_at), 'EEE, MMM d, yyyy h:mm a')}
          </p>
        )}
      </header>

      {quiz.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <CanvasHtml html={quiz.description} className="text-sm leading-relaxed sm:text-base" />
          </CardContent>
        </Card>
      )}

      <QuizEngine courseId={courseId} quizId={quizId} />

      <Button asChild variant="outline" className="w-full sm:w-auto">
        <a href={quiz.html_url} target="_blank" rel="noopener noreferrer">
          <ArrowSquareOutIcon className="h-4 w-4" /> View on Canvas
        </a>
      </Button>
    </div>
  );
}
