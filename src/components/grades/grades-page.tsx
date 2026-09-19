'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { CourseDot, SideList, SideListItem } from '@/components/shared/side-list';
import { useSearchParams } from 'next/navigation';
import { useCourseColors, useCourses } from '@/hooks/use-canvas';
import type { CourseWithGrade } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { courseTitle } from '@/lib/course-name';
import { CourseGradeDetail } from './course-grade-detail';
import { formatPercent } from './grade-math';
import { getStudentEnrollment, summarizeCourseScore } from './grades-data';

/** Updates ?course= without a navigation; Next keeps useSearchParams in sync with history.replaceState. */
function replaceCourseParam(courseId: number) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('course') === String(courseId)) return;
  params.set('course', String(courseId));
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

function PageTitle() {
  return <h1 className="text-[22px] font-semibold tracking-tight">Grades</h1>;
}

export function GradesPageSkeleton() {
  return (
    <div className="space-y-8">
      <PageTitle />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Skeleton className="h-64 rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export function GradesPage() {
  const { data: courses, loading, error, refetch } = useCourses();
  const { getColor } = useCourseColors();
  const searchParams = useSearchParams();

  const studentCourses = useMemo(() => (courses ?? []).filter(course => getStudentEnrollment(course)), [courses]);
  const requestedId = Number(searchParams.get('course'));
  const selected = studentCourses.find(course => course.id === requestedId) ?? studentCourses[0];

  // Keep the URL pointing at the course on screen (also fills in the default).
  useEffect(() => {
    if (selected) replaceCourseParam(selected.id);
  }, [selected]);

  const selectCourse = useCallback((courseId: number) => replaceCourseParam(courseId), []);

  if (loading) return <GradesPageSkeleton />;

  if (error || !selected) {
    return (
      <div className="space-y-8">
        <PageTitle />
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border px-6 text-center">
          <p className="text-[15px] font-medium">{error ? "Couldn't load your grades" : 'No graded courses'}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {error ? 'Check your connection and try again.' : "You aren't enrolled as a student in an active course."}
          </p>
          {error && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-8">
      <PageTitle />
      <div className="grid grid-cols-1 min-w-0 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <CourseList courses={studentCourses} selectedId={selected.id} getColor={getColor} onSelect={selectCourse} />
        <CourseGradeDetail key={selected.id} course={selected} color={getColor(selected.id)} />
      </div>
    </div>
  );
}

function CourseList({
  courses,
  selectedId,
  getColor,
  onSelect,
}: {
  courses: CourseWithGrade[];
  selectedId: number;
  getColor: (courseId: number) => string;
  onSelect: (courseId: number) => void;
}) {
  return (
    <SideList label="Courses" className="lg:sticky lg:top-6">
      {courses.map(course => {
        const summary = summarizeCourseScore(course);
        const score = summary.score ?? summary.periodScore;
        return (
          <SideListItem
            key={course.id}
            active={course.id === selectedId}
            onClick={() => onSelect(course.id)}
            title={course.name}
            leading={<CourseDot color={getColor(course.id)} />}
            trailing={summary.hidden ? 'Hidden' : formatPercent(score, '–')}
          >
            {courseTitle(course)}
          </SideListItem>
        );
      })}
    </SideList>
  );
}
