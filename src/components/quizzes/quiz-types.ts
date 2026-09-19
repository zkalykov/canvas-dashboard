import type { Quiz, QuizSubmission } from '@/lib/types';

/** Quiz fields Canvas returns that the shared Quiz type doesn't list. */
export type QuizDetails = Quiz & {
  assignment_id?: number | null;
  points_possible?: number | null;
  allowed_attempts?: number | null;
  one_question_at_a_time?: boolean;
  cant_go_back?: boolean;
  require_lockdown_browser?: boolean;
  require_lockdown_browser_for_results?: boolean;
  hide_results?: string | null;
};

/** QuizSubmission with the nullable/extra fields Canvas actually sends. */
export type QuizAttemptSubmission = Omit<QuizSubmission, 'score' | 'kept_score' | 'validation_token'> & {
  score: number | null;
  kept_score: number | null;
  validation_token?: string;
  attempts_left?: number;
  overdue_and_needs_submission?: boolean;
  quiz_points_possible?: number | null;
};

export function quizPoints(quiz: QuizDetails): number | null {
  const value = quiz.points_possible ?? quiz.point_value;
  return value === undefined || value === null ? null : value;
}
