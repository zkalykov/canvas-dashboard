'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAssignmentGroups, useCourse } from '@/hooks/use-canvas';
import { CanvasApiError } from '@/lib/canvas-api';
import type { CourseWithGrade } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { courseCode, courseTitle } from '@/lib/course-name';
import { AssignmentGroupCard } from './assignment-group-card';
import { computeCourseGrade, formatPercent, formatPoints, parseOverrides, toGradeGroups } from './grade-math';
import { getStudentEnrollment, summarizeCourseScore, usePeriodAssignmentGroups } from './grades-data';

type Scope = 'period' | 'all';

function errorMessage(error: Error): string {
  if (error instanceof CanvasApiError) {
    if (error.status === 401) return 'Your session has expired. Log in again to see your grades.';
    if (error.status === 403) return "Canvas doesn't show the assignment breakdown for this course.";
  }
  return "Couldn't load this course's assignments.";
}

export function CourseGradeDetail({ course, color }: { course: CourseWithGrade; color: string }) {
  const summary = summarizeCourseScore(course);
  const periodId = summary.hasPeriods ? (getStudentEnrollment(course)?.current_grading_period_id ?? null) : null;

  const [scope, setScope] = useState<Scope>(periodId ? 'period' : 'all');
  const [whatIfMode, setWhatIfMode] = useState(false);
  const [rawOverrides, setRawOverrides] = useState<Record<number, string>>({});

  const periodScope = scope === 'period' && periodId !== null;
  const allGroups = useAssignmentGroups(periodScope ? null : course.id);
  const periodGroups = usePeriodAssignmentGroups(course.id, periodScope ? periodId : null);
  const groupsQuery = periodScope ? periodGroups : allGroups;
  const { data: courseDetail, loading: detailLoading } = useCourse(course.id);

  const weighted = Boolean(courseDetail?.apply_assignment_group_weights ?? course.apply_assignment_group_weights);

  const groups = useMemo(
    () => [...(groupsQuery.data ?? [])].sort((a, b) => a.position - b.position),
    [groupsQuery.data]
  );
  const overrides = useMemo(() => parseOverrides(rawOverrides), [rawOverrides]);
  const baseline = useMemo(() => computeCourseGrade(toGradeGroups(groups), weighted), [groups, weighted]);
  const whatIf = useMemo(() => computeCourseGrade(toGradeGroups(groups, overrides), weighted), [groups, overrides, weighted]);
  const shown = whatIfMode ? whatIf : baseline;

  const changedCount = useMemo(() => {
    let count = 0;
    for (const group of groups) {
      for (const assignment of group.assignments ?? []) {
        const value = overrides[assignment.id];
        if (value === undefined) continue;
        const actual = assignment.submission?.excused ? null : (assignment.submission?.score ?? null);
        if (value !== actual) count += 1;
      }
    }
    return count;
  }, [groups, overrides]);

  const onOverrideChange = useCallback((assignmentId: number, value: string) => {
    setRawOverrides(prev => ({ ...prev, [assignmentId]: value }));
  }, []);

  const canvasPercent = periodScope ? summary.periodScore : summary.score;
  const canvasGrade = periodScope ? summary.periodGrade : summary.grade;
  const assignmentCount = groups.reduce((total, g) => total + (g.assignments?.length ?? 0), 0);
  const loading = groupsQuery.loading || (detailLoading && !courseDetail);
  const delta = whatIf.percent !== null && baseline.percent !== null ? whatIf.percent - baseline.percent : 0;
  const code = courseCode(course);

  return (
    <div className="min-w-0 space-y-8">
      {/* Course header: name on the left, the grade on the right */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {[code, course.term?.name].filter(Boolean).join(' · ')}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{courseTitle(course)}</h2>
        </div>
        <div className="text-right">
          <p className="text-4xl font-semibold tracking-tight tabular-nums">
            {summary.hidden ? 'Hidden' : formatPercent(whatIfMode ? whatIf.percent : canvasPercent, '–')}
            {!whatIfMode && canvasGrade && <span className="ml-2 text-xl font-medium text-muted-foreground">{canvasGrade}</span>}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {whatIfMode
              ? changedCount > 0
                ? `What-if · ${delta >= 0 ? '+' : ''}${formatPoints(delta)}% from ${changedCount} change${changedCount === 1 ? '' : 's'}`
                : 'What-if · type scores below'
              : periodScope
                ? summary.periodTitle
                : summary.hidden
                  ? 'Your instructor hides totals'
                  : canvasPercent === null
                    ? 'No grade yet'
                    : 'Current grade'}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-1 text-[14px]">
          {periodId !== null ? (
            (['period', 'all'] as const).map(value => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                className={cn(
                  'rounded-full px-3 py-1 transition-colors',
                  scope === value ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {value === 'period' ? summary.periodTitle : 'All periods'}
              </button>
            ))
          ) : (
            <p className="text-muted-foreground">{weighted ? 'Weighted by assignment group' : 'Based on total points'}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {whatIfMode && changedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setRawOverrides({})}>
              Reset
            </Button>
          )}
          <Label htmlFor={`what-if-${course.id}`} className="cursor-pointer text-[14px] font-normal">
            What-if
          </Label>
          <Switch id={`what-if-${course.id}`} checked={whatIfMode} onCheckedChange={setWhatIfMode} />
        </div>
      </div>

      {whatIfMode && (
        <p className="-mt-5 text-[13px] text-muted-foreground">
          Type any score to see how it changes your grade. It&apos;s an estimate and nothing is sent to Canvas.
        </p>
      )}

      {loading ? (
        <div className="space-y-6">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : groupsQuery.error ? (
        <div className="rounded-2xl border px-6 py-8 text-center">
          <p className="text-[15px] font-medium">{errorMessage(groupsQuery.error)}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => groupsQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : assignmentCount === 0 ? (
        <div className="rounded-2xl border px-6 py-10 text-center">
          <p className="text-[15px] font-medium">No assignments yet</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Your breakdown will show up once work is posted.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(group => (
            <AssignmentGroupCard
              key={group.id}
              courseId={course.id}
              group={group}
              weighted={weighted}
              result={shown.groups.find(g => g.id === group.id)}
              baseline={baseline.groups.find(g => g.id === group.id)}
              whatIfMode={whatIfMode}
              overrides={rawOverrides}
              onOverrideChange={onOverrideChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
