import { mutate } from 'swr';

const EXACT_KEYS = new Set([
  'canvas_all_assignments',
  'canvas_missing_submissions',
]);

/**
 * After a submission or quiz completes, revalidate the lists that show
 * submission status (dashboard, assignments page, planner, calendar, grades).
 */
export function refreshSubmissionCaches(courseId: number): Promise<unknown> {
  return mutate(
    key =>
      typeof key === 'string' &&
      (EXACT_KEYS.has(key) ||
        key === `canvas_assignments_${courseId}` ||
        key === `canvas_assignment_groups_${courseId}` ||
        key.startsWith(`canvas_assignment_groups_${courseId}_period_`) ||
        key.startsWith('canvas_planner_') ||
        key.startsWith('canvas_calendar_'))
  );
}
