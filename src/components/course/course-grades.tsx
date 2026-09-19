'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { useAssignments } from '@/hooks/use-canvas';
import type { Course } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { courseScores, formatPercent, gradedScore } from './course-ui';

export function CourseGrades({ course }: { course: Course }) {
  const scores = courseScores(course);
  const hasScore = Boolean(scores.current || scores.currentGrade || scores.period);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Course grade
          </CardTitle>
          <CardDescription>As calculated by Canvas from graded work.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {hasScore ? (
            <>
              <ScoreLine label="Current score" score={scores.current} grade={scores.currentGrade} large />
              {scores.period && (
                <ScoreLine
                  label={scores.periodTitle ? `${scores.periodTitle} (current period)` : 'Current grading period'}
                  score={scores.period}
                  grade={scores.periodGrade}
                />
              )}
              {scores.final && scores.final !== scores.current && (
                <ScoreLine
                  label="Final score (ungraded work counts as 0)"
                  score={scores.final}
                  grade={scores.finalGrade}
                />
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {scores.hidden
                ? 'Your instructor has hidden course totals.'
                : 'No grade yet. Scores appear once work has been graded.'}
            </p>
          )}
          <Button asChild className="w-full">
            <Link href={`/grades?course=${course.id}`}>
              Full grade breakdown <ArrowRightIcon />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <RecentlyGraded courseId={course.id} />
    </div>
  );
}

function ScoreLine({
  label,
  score,
  grade,
  large = false,
}: {
  label: string;
  score: string | null;
  grade: string | null;
  large?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={large ? 'text-4xl font-bold tabular-nums' : 'text-xl font-semibold tabular-nums'}>
          {score ?? '–'}
        </span>
        {grade && <Badge variant="secondary">{grade}</Badge>}
      </div>
    </div>
  );
}

function RecentlyGraded({ courseId }: { courseId: number }) {
  const { data, loading, error } = useAssignments(courseId);

  const graded = useMemo(
    () =>
      (data ?? [])
        .filter(a => a.submission?.workflow_state === 'graded' && (a.submission.score !== null || a.submission.excused))
        .sort((a, b) => {
          const at = a.submission?.graded_at ?? a.submission?.submitted_at ?? a.due_at ?? '';
          const bt = b.submission?.graded_at ?? b.submission?.submitted_at ?? b.due_at ?? '';
          return bt.localeCompare(at);
        })
        .slice(0, 8),
    [data]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recently graded</CardTitle>
        <CardDescription>Your latest scores in this course.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load assignment scores.</p>
        ) : graded.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has been graded yet.</p>
        ) : (
          <ul className="-mx-2 divide-y">
            {graded.map(assignment => {
              const score = assignment.submission?.score;
              const percent =
                score !== null && score !== undefined && assignment.points_possible
                  ? formatPercent((score / assignment.points_possible) * 100)
                  : null;
              const gradedAt = assignment.submission?.graded_at;
              return (
                <li key={assignment.id}>
                  <Link
                    href={`/courses/${courseId}/assignments/${assignment.id}`}
                    className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{assignment.name}</p>
                      {gradedAt && (
                        <p className="text-xs text-muted-foreground">
                          Graded {format(new Date(gradedAt), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums">{gradedScore(assignment)}</div>
                      {percent && <div className="text-xs tabular-nums text-muted-foreground">{percent}</div>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
