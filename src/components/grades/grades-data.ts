'use client';

import canvasApi from '@/lib/canvas-api';
import { useCanvasData } from '@/hooks/use-canvas';
import type { AssignmentGroup, Course, Enrollment } from '@/lib/types';

/** The signed-in student's enrollment in a course (courses list includes total + period scores). */
export function getStudentEnrollment(course: Pick<Course, 'enrollments'> | null | undefined): Enrollment | undefined {
  return course?.enrollments?.find(e => e.type === 'student' || e.type === 'StudentEnrollment');
}

export interface CourseScoreSummary {
  score: number | null;
  grade: string | null;
  hasPeriods: boolean;
  periodTitle: string | null;
  periodScore: number | null;
  periodGrade: string | null;
  /** The instructor hides totals (hide_final_grades) from students. */
  hidden: boolean;
}

export function summarizeCourseScore(course: Course): CourseScoreSummary {
  const enrollment = getStudentEnrollment(course);
  const hidden = Boolean(course.hide_final_grades);
  const hasPeriods = Boolean(enrollment?.has_grading_periods && enrollment?.current_grading_period_id);
  return {
    score: hidden ? null : (enrollment?.computed_current_score ?? null),
    grade: hidden ? null : (enrollment?.computed_current_grade ?? null),
    hasPeriods,
    periodTitle: hasPeriods ? (enrollment?.current_grading_period_title ?? 'Current period') : null,
    periodScore: hidden || !hasPeriods ? null : (enrollment?.current_period_computed_current_score ?? null),
    periodGrade: hidden || !hasPeriods ? null : (enrollment?.current_period_computed_current_grade ?? null),
    hidden,
  };
}

/**
 * Assignment groups limited to one grading period. The shared useAssignmentGroups
 * hook returns every period, so this calls Canvas directly with grading_period_id.
 */
export function usePeriodAssignmentGroups(
  courseId: number | null | undefined,
  gradingPeriodId: number | null | undefined
) {
  const key = courseId && gradingPeriodId ? `canvas_assignment_groups_${courseId}_period_${gradingPeriodId}` : null;
  return useCanvasData<AssignmentGroup[]>(key, () =>
    canvasApi.requestAll<AssignmentGroup>(
      `/courses/${courseId}/assignment_groups?include[]=assignments&include[]=submission` +
        `&grading_period_id=${gradingPeriodId}&scope_assignments_to_student=true&per_page=100`
    )
  );
}
