import type { Submission } from './types';

/**
 * True when the student has turned the work in (or it no longer needs them).
 * Canvas workflow states: unsubmitted | submitted | pending_review | graded.
 * `submitted_at` is the reliable "student actually submitted" signal; a graded
 * submission without it (e.g. on-paper work) also counts as done unless Canvas
 * flags it missing.
 */
export function isSubmitted(submission: Partial<Submission> | null | undefined): boolean {
  if (!submission) return false;
  if (submission.excused) return true;
  if (submission.submitted_at) return true;
  const state = submission.workflow_state;
  if (state === 'submitted' || state === 'pending_review') return true;
  if (state === 'graded') return !submission.missing;
  return false;
}

export type AssignmentState = 'submitted' | 'missing' | 'overdue' | 'upcoming' | 'undated';

/** One status per assignment for list badges and filters. */
export function assignmentState(assignment: { due_at: string | null; submission?: Partial<Submission> | null }): AssignmentState {
  if (isSubmitted(assignment.submission)) return 'submitted';
  if (assignment.submission?.missing) return 'missing';
  if (!assignment.due_at) return 'undated';
  return new Date(assignment.due_at).getTime() < Date.now() ? 'overdue' : 'upcoming';
}
