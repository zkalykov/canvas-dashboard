// Canvas API Types

export interface User {
  id: number;
  name: string;
  short_name: string;
  sortable_name: string;
  avatar_url: string;
  email?: string;
  login_id?: string;
  bio?: string;
  primary_email?: string;
  time_zone?: string;
}

export interface Course {
  id: number;
  name: string;
  course_code: string;
  enrollment_term_id: number;
  start_at: string | null;
  end_at: string | null;
  workflow_state: string;
  default_view: string;
  account_id?: number;
  original_name?: string;
  apply_assignment_group_weights?: boolean;
  hide_final_grades?: boolean;
  is_favorite?: boolean;
  syllabus_body?: string | null;
  term?: { id: number; name: string; start_at: string | null; end_at: string | null };
  enrollments?: Enrollment[];
}

export interface Enrollment {
  type: string;
  role: string;
  enrollment_state: string;
  computed_current_score: number | null;
  computed_final_score: number | null;
  computed_current_grade: string | null;
  computed_final_grade: string | null;
  has_grading_periods?: boolean;
  current_grading_period_id?: number | null;
  current_grading_period_title?: string | null;
  current_period_computed_current_score?: number | null;
  current_period_computed_final_score?: number | null;
  current_period_computed_current_grade?: string | null;
  current_period_computed_final_grade?: string | null;
}

export interface Assignment {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  lock_at: string | null;
  unlock_at: string | null;
  course_id: number;
  html_url: string;
  points_possible: number;
  submission_types: string[];
  has_submitted_submissions: boolean;
  quiz_id?: number;
  is_quiz_assignment?: boolean;
  assignment_group_id?: number;
  allowed_extensions?: string[];
  allowed_attempts?: number;
  locked_for_user?: boolean;
  lock_explanation?: string;
  omit_from_final_grade?: boolean;
  external_tool_tag_attributes?: { url: string; new_tab?: boolean };
  rubric?: RubricCriterion[];
  submission?: Submission;
}

export interface Submission {
  id: number;
  assignment_id: number;
  user_id: number;
  submitted_at: string | null;
  score: number | null;
  grade: string | null;
  workflow_state: string;
  late: boolean;
  missing: boolean;
  excused?: boolean | null;
  attempt?: number | null;
  body?: string | null;
  url?: string | null;
  preview_url?: string;
  submission_type?: string | null;
  graded_at?: string | null;
  entered_score?: number | null;
  points_deducted?: number | null;
  seconds_late?: number;
  attachments?: Attachment[];
  submission_comments?: SubmissionComment[];
  submission_history?: Submission[];
  rubric_assessment?: Record<string, RubricAssessmentEntry>;
}

export interface SubmissionComment {
  id: number;
  author_id: number;
  author_name: string;
  author?: { id: number; display_name: string; avatar_image_url?: string };
  comment: string;
  created_at: string;
  edited_at?: string | null;
  attempt?: number | null;
  attachments?: Attachment[];
}

export interface RubricAssessmentEntry {
  points?: number | null;
  rating_id?: string | null;
  comments?: string | null;
}

export interface RubricCriterion {
  id: string;
  description: string;
  long_description?: string;
  points: number;
  ratings: RubricRating[];
}

export interface RubricRating {
  id: string;
  description: string;
  points: number;
}

export interface CalendarEvent {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
  description: string | null;
  context_code: string;
  context_name: string;
  workflow_state: string;
  type: 'event' | 'assignment';
  html_url: string;
  assignment?: Assignment;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  posted_at: string;
  context_code: string;
  author: {
    id: number;
    display_name: string;
    avatar_image_url: string;
  };
  read_state: 'read' | 'unread';
  html_url: string;
}

export interface DiscussionTopic {
  id: number;
  title: string;
  message: string;
  posted_at: string;
  last_reply_at: string | null;
  discussion_subentry_count: number;
  read_state: 'read' | 'unread';
  unread_count: number;
  html_url: string;
  author: {
    id: number;
    display_name: string;
    avatar_image_url: string;
  };
  course_id: number;
}

export interface Attachment {
  id: number;
  display_name: string;
  filename: string;
  url: string;
  size: number;
  content_type?: string;
  'content-type'?: string;
  created_at: string;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  mime_class?: string;
}

export interface DiscussionEntry {
  id: number;
  user_id: number;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
  message: string;
  user_name: string;
  user?: {
    id: number;
    display_name: string;
    avatar_image_url: string;
    html_url?: string;
  };
  can_rate?: boolean;
  rating_sum?: number;
  rating_count?: number;
  has_more_replies?: boolean;
  deleted?: boolean;
  unread?: boolean;
  replies?: DiscussionEntry[];
}

export interface Quiz {
  id: number;
  title: string;
  html_url: string;
  mobile_url: string;
  description: string;
  quiz_type: string;
  time_limit: number | null;
  shuffle_answers: boolean;
  show_correct_answers: boolean;
  scoring_policy: string;
  point_value: number;
  question_count: number;
  has_access_code: boolean;
  due_at: string | null;
  lock_at: string | null;
  unlock_at: string | null;
  published: boolean;
  locked_for_user: boolean;
  lock_info?: unknown;
  lock_explanation?: string;
}

export interface QuizSubmission {
  id: number;
  quiz_id: number;
  user_id: number;
  submission_id: number;
  started_at: string;
  finished_at: string | null;
  end_at: string | null;
  attempt: number;
  extra_attempts: number;
  extra_time: number;
  time_spent: number;
  score: number;
  score_before_regrade: number;
  kept_score: number;
  fudge_points: number;
  has_seen_results: boolean;
  workflow_state: 'untaken' | 'pending_review' | 'complete' | 'settings_only' | 'preview';
  validation_token: string;
}

// App-specific types

export interface PersonalTask {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  courseId?: number;
  createdAt: string;
}

export interface CourseWithGrade extends Course {
  currentGrade?: string;
  currentScore?: number;
  finalGrade?: string;
  finalScore?: number;
}

// ---------------------------------------------------------------------------
// Additional Canvas API types (planner, files, modules, pages, inbox, grades)
// ---------------------------------------------------------------------------

export interface QuizSubmissionQuestion {
  id: number;
  quiz_id?: number;
  position?: number;
  question_name?: string;
  question_type: string;
  question_text: string;
  points_possible?: number;
  flagged: boolean;
  /** The student's saved answer, shape depends on question_type. */
  answer: unknown;
  answers?: { id: number; text: string; html?: string }[];
  /** matching_question: the right-hand options. */
  matches?: { match_id: number; text: string }[];
}

export interface PlannerOverride {
  id: number;
  plannable_type: string;
  plannable_id: number;
  user_id: number;
  assignment_id?: number | null;
  workflow_state: string;
  marked_complete: boolean;
  dismissed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PlannerSubmissionStatus {
  submitted?: boolean;
  excused?: boolean;
  graded?: boolean;
  late?: boolean;
  missing?: boolean;
  needs_grading?: boolean;
  with_feedback?: boolean;
  has_feedback?: boolean;
}

export interface PlannerItem {
  context_type?: string;
  course_id?: number;
  group_id?: number;
  context_name?: string;
  context_image?: string | null;
  plannable_id: number;
  plannable_type: string;
  plannable_date?: string;
  plannable: {
    id: number;
    title: string;
    due_at?: string | null;
    todo_date?: string | null;
    points_possible?: number | null;
    details?: string | null;
    [key: string]: unknown;
  };
  planner_override: PlannerOverride | null;
  submissions: PlannerSubmissionStatus | false;
  new_activity?: boolean;
  html_url: string;
}

export interface PlannerNote {
  id: number;
  title: string;
  description?: string | null;
  details?: string | null;
  user_id: number;
  workflow_state: string;
  course_id: number | null;
  todo_date: string;
  linked_object_type?: string | null;
  linked_object_id?: number | null;
  linked_object_html_url?: string | null;
}

export interface CanvasFile {
  id: number;
  folder_id: number;
  display_name: string;
  filename: string;
  'content-type': string;
  url: string;
  size: number;
  created_at: string;
  updated_at: string;
  modified_at?: string;
  locked: boolean;
  hidden: boolean;
  locked_for_user: boolean;
  lock_explanation?: string;
  thumbnail_url: string | null;
  preview_url?: string | null;
  mime_class: string;
  media_entry_id?: string | null;
  user?: { id: number; display_name: string; avatar_image_url?: string };
}

export interface CanvasFolder {
  id: number;
  name: string;
  full_name: string;
  context_id: number;
  context_type: string;
  parent_folder_id: number | null;
  files_count: number;
  folders_count: number;
  files_url: string;
  folders_url: string;
  locked: boolean;
  locked_for_user: boolean;
  hidden?: boolean;
  hidden_for_user: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourseTab {
  id: string;
  html_url: string;
  full_url?: string;
  position: number;
  label: string;
  type: 'internal' | 'external';
  hidden?: boolean;
  visibility?: string;
}

export interface ModuleItem {
  id: number;
  module_id: number;
  position: number;
  title: string;
  indent: number;
  type: 'File' | 'Page' | 'Discussion' | 'Assignment' | 'Quiz' | 'SubHeader' | 'ExternalUrl' | 'ExternalTool';
  content_id?: number;
  html_url?: string;
  url?: string;
  page_url?: string;
  external_url?: string;
  new_tab?: boolean;
  completion_requirement?: {
    type: 'must_view' | 'must_submit' | 'must_contribute' | 'min_score' | 'must_mark_done';
    min_score?: number;
    completed?: boolean;
  };
  content_details?: {
    points_possible?: number;
    due_at?: string | null;
    unlock_at?: string | null;
    lock_at?: string | null;
    locked_for_user?: boolean;
    lock_explanation?: string;
  };
}

export interface CourseModule {
  id: number;
  workflow_state: string;
  position: number;
  name: string;
  unlock_at: string | null;
  require_sequential_progress: boolean;
  prerequisite_module_ids: number[];
  items_count: number;
  items_url: string;
  items?: ModuleItem[];
  state?: 'locked' | 'unlocked' | 'started' | 'completed';
  completed_at?: string | null;
}

export interface CoursePage {
  page_id: number;
  url: string;
  title: string;
  created_at: string;
  updated_at: string;
  body?: string;
  published: boolean;
  front_page: boolean;
  locked_for_user?: boolean;
  lock_explanation?: string;
  html_url: string;
}

export interface ConversationParticipant {
  id: number;
  name: string;
  full_name?: string;
  avatar_url?: string;
}

export interface Conversation {
  id: number;
  subject: string | null;
  workflow_state: 'read' | 'unread' | 'archived';
  last_message: string | null;
  last_message_at: string | null;
  last_authored_message_at?: string | null;
  message_count: number;
  subscribed?: boolean;
  private?: boolean;
  starred: boolean;
  properties?: string[];
  audience?: number[];
  avatar_url?: string;
  participants: ConversationParticipant[];
  context_name?: string;
  context_code?: string;
}

export interface ConversationMessage {
  id: number;
  created_at: string;
  body: string;
  author_id: number;
  generated?: boolean;
  attachments?: Attachment[];
  participating_user_ids?: number[];
  forwarded_messages?: ConversationMessage[];
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
}

export interface Recipient {
  id: string | number;
  name: string;
  full_name?: string;
  avatar_url?: string;
  type?: 'context' | 'user';
  user_count?: number;
  common_courses?: Record<string, string[]>;
}

export interface AccountNotification {
  id: number;
  subject: string;
  message: string;
  start_at: string;
  end_at: string;
  icon: 'warning' | 'information' | 'question' | 'error' | 'calendar';
}

export interface AssignmentGroup {
  id: number;
  name: string;
  position: number;
  group_weight: number;
  rules?: { drop_lowest?: number; drop_highest?: number; never_drop?: number[] };
  assignments?: Assignment[];
}

export interface DiscussionParticipant {
  id: number;
  display_name: string;
  avatar_image_url?: string;
  html_url?: string;
}

export interface DiscussionThread {
  entries: DiscussionEntry[];
  unreadEntryIds: number[];
  participants: Record<number, DiscussionParticipant>;
}
