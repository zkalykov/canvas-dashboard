'use client';

import { useCallback, useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import canvasApi from '@/lib/canvas-api';
import { trackFirstScreen, useFirstScreenSettled } from '@/lib/first-screen';
import type {
  User,
  Course,
  CourseWithGrade,
  Assignment,
  AssignmentGroup,
  CalendarEvent,
  Announcement,
  DiscussionTopic,
  DiscussionThread,
  Submission,
  Quiz,
  PlannerItem,
  PlannerNote,
  PlannerOverride,
  CanvasFile,
  CanvasFolder,
  CourseTab,
  CourseModule,
  CoursePage,
  Conversation,
  ConversationDetail,
  AccountNotification,
} from '@/lib/types';
import { courseTitle } from '@/lib/course-name';

export interface LoadOptions {
  /** Wait until the first screen has its data (for numbers and lists that aren't the point of the page). */
  deferred?: boolean;
}

/**
 * Generic hook for data fetching. Pass a null key to skip the request.
 * Loads are counted so background work waits for the first screen (see first-screen.ts).
 */
export function useCanvasData<T>(key: string | null, fetcher: () => Promise<T>, { deferred = false }: LoadOptions = {}) {
  const settled = useFirstScreenSettled();
  const { data, error, isLoading, mutate } = useSWR<T>(deferred && !settled ? null : key, () => trackFirstScreen(fetcher()), {
    revalidateOnFocus: false, // Don't constantly refetch when switching tabs
    dedupingInterval: 60000, // Deduplicate requests within 1 minute
    errorRetryCount: 1, // Minimize aggressive retries on error
  });

  return {
    data,
    // "Loading" means nothing to show yet. SWR also reports isLoading while it refreshes
    // data that was preloaded or filled in from another list; that data is shown instead.
    loading: data === undefined && (isLoading || (deferred && !settled && key !== null)),
    error: error as Error | undefined,
    refetch: mutate,
  };
}

// ---------------------------------------------------------------------------
// User & courses
// ---------------------------------------------------------------------------

export function useUser() {
  return useCanvasData<User>('canvas_user', () => canvasApi.getCurrentUser());
}

export function useCourses() {
  return useCanvasData<CourseWithGrade[]>('canvas_courses_grades', () => canvasApi.getCoursesWithGrades());
}

export function useCourse(courseId: number | null | undefined) {
  return useCanvasData<Course>(courseId ? `canvas_course_${courseId}` : null, () => canvasApi.getCourse(courseId!));
}

export function useCourseTabs(courseId: number | null | undefined) {
  return useCanvasData<CourseTab[]>(courseId ? `canvas_tabs_${courseId}` : null, () => canvasApi.getCourseTabs(courseId!));
}

const FALLBACK_COURSE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#6366f1', '#f97316'];

export function fallbackCourseColor(courseId: number): string {
  return FALLBACK_COURSE_COLORS[Math.abs(courseId) % FALLBACK_COURSE_COLORS.length];
}

/**
 * The student's own Canvas course colors. Use with inline styles:
 *   const { getColor } = useCourseColors();
 *   <span style={{ backgroundColor: getColor(course.id) }} />
 */
export function useCourseColors() {
  const { data, loading } = useCanvasData<Record<number, string>>('canvas_course_colors', () =>
    canvasApi.getCourseColors()
  );
  const getColor = useCallback((courseId: number) => data?.[courseId] ?? fallbackCourseColor(courseId), [data]);
  return { getColor, loading };
}

/** Course code (or name) lookup that works everywhere a course id is known. */
export function useCourseName() {
  const { data: courses } = useCourses();
  return useCallback(
    (courseId: number) => {
      const course = courses?.find(c => c.id === courseId);
      return course ? courseTitle(course) : 'Course';
    },
    [courses]
  );
}

// ---------------------------------------------------------------------------
// Assignments, submissions, grades
// ---------------------------------------------------------------------------

/**
 * The all-courses list already holds every course's assignments, so it fills the
 * per-course lists and single assignments too: course and assignment pages then open
 * with data on screen (they still refresh in the background).
 */
async function loadAllAssignments(): Promise<Assignment[]> {
  const [courses, assignments] = await Promise.all([canvasApi.getCourses(), canvasApi.getAllAssignments()]);
  const byCourse = new Map<number, Assignment[]>(courses.map(course => [course.id, []]));
  for (const assignment of assignments) byCourse.get(assignment.course_id)?.push(assignment);
  for (const [courseId, list] of byCourse) {
    void mutate(`canvas_assignments_${courseId}`, list, { revalidate: false });
    for (const assignment of list) {
      void mutate<Assignment>(`canvas_assignment_${courseId}_${assignment.id}`, current => current ?? assignment, { revalidate: false });
    }
  }
  return assignments;
}

export function useAssignments(courseId?: number) {
  return useCanvasData<Assignment[]>(
    courseId ? `canvas_assignments_${courseId}` : 'canvas_all_assignments',
    () => (courseId ? canvasApi.getAssignments(courseId) : loadAllAssignments())
  );
}

export function useAssignment(courseId: number, assignmentId: number) {
  return useCanvasData<Assignment>(
    courseId && assignmentId ? `canvas_assignment_${courseId}_${assignmentId}` : null,
    () => canvasApi.getAssignment(courseId, assignmentId)
  );
}

function upcomingOnly(assignments: Assignment[]): Assignment[] {
  const now = Date.now();
  return assignments
    .filter(a => a.due_at && new Date(a.due_at).getTime() > now)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
}

/** Future work, soonest first. Derived from the all-assignments list (no second download). */
export function useUpcomingAssignments() {
  const all = useAssignments();
  const data = useMemo(() => (all.data ? upcomingOnly(all.data) : undefined), [all.data]);
  return { data, loading: all.loading, error: all.error, refetch: all.refetch };
}

export function useMissingSubmissions() {
  return useCanvasData<(Assignment & { course?: Course })[]>('canvas_missing_submissions', () =>
    canvasApi.getMissingSubmissions()
  );
}

/** The student's submission with comments, rubric assessment and history. */
export function useMySubmission(courseId: number | null | undefined, assignmentId: number | null | undefined) {
  return useCanvasData<Submission>(
    courseId && assignmentId ? `canvas_my_submission_${courseId}_${assignmentId}` : null,
    () => canvasApi.getMySubmission(courseId!, assignmentId!)
  );
}

export function useAssignmentGroups(courseId: number | null | undefined) {
  return useCanvasData<AssignmentGroup[]>(courseId ? `canvas_assignment_groups_${courseId}` : null, () =>
    canvasApi.getAssignmentGroups(courseId!)
  );
}

export function useQuiz(courseId: number | null | undefined, quizId: number | null | undefined) {
  return useCanvasData<Quiz>(courseId && quizId ? `canvas_quiz_${courseId}_${quizId}` : null, () =>
    canvasApi.getQuiz(courseId!, quizId!)
  );
}

// ---------------------------------------------------------------------------
// Planner & to-do
// ---------------------------------------------------------------------------

/** Planner items between two dates (ISO strings or yyyy-mm-dd). */
export function usePlannerItems(
  startDate: string,
  endDate: string,
  filter?: 'new_activity' | 'incomplete_items' | 'complete_items'
) {
  return useCanvasData<PlannerItem[]>(`canvas_planner_${startDate}_${endDate}_${filter ?? 'all'}`, () =>
    canvasApi.getPlannerItems({ startDate: new Date(startDate), endDate: new Date(endDate), filter })
  );
}

export function usePlannerNotes(options?: LoadOptions) {
  return useCanvasData<PlannerNote[]>('canvas_planner_notes', () => canvasApi.getPlannerNotes(), options);
}

export function usePlannerOverrides(options?: LoadOptions) {
  return useCanvasData<PlannerOverride[]>('canvas_planner_overrides', () => canvasApi.getPlannerOverrides(), options);
}

// ---------------------------------------------------------------------------
// Calendar, announcements, notices
// ---------------------------------------------------------------------------

export function useCalendar(startDate: string, endDate: string) {
  return useCanvasData<CalendarEvent[]>(`canvas_calendar_${startDate}_${endDate}`, () =>
    canvasApi.getAllCalendarItems(startDate, endDate)
  );
}

export function useAnnouncements(options?: LoadOptions) {
  return useCanvasData<Announcement[]>('canvas_announcements', () => canvasApi.getAnnouncements(), options);
}

export function useAccountNotifications() {
  return useCanvasData<AccountNotification[]>('canvas_account_notifications', () =>
    canvasApi.getAccountNotifications()
  );
}

// ---------------------------------------------------------------------------
// Discussions
// ---------------------------------------------------------------------------

export function useDiscussions(options?: LoadOptions) {
  return useCanvasData<DiscussionTopic[]>('canvas_discussions', () => canvasApi.getAllDiscussions(), options);
}

export function useDiscussionTopic(courseId: number | null | undefined, topicId: number | null | undefined) {
  return useCanvasData<DiscussionTopic>(courseId && topicId ? `canvas_topic_${courseId}_${topicId}` : null, () =>
    canvasApi.getDiscussionTopic(courseId!, topicId!)
  );
}

export function useDiscussionThread(courseId: number | null | undefined, topicId: number | null | undefined) {
  return useCanvasData<DiscussionThread>(
    courseId && topicId ? `canvas_thread_${courseId}_${topicId}` : null,
    () => canvasApi.getDiscussionThread(courseId!, topicId!)
  );
}

// ---------------------------------------------------------------------------
// Course content: modules, pages, files
// ---------------------------------------------------------------------------

export function useModules(courseId: number | null | undefined) {
  return useCanvasData<CourseModule[]>(courseId ? `canvas_modules_${courseId}` : null, () =>
    canvasApi.getModules(courseId!)
  );
}

export function usePages(courseId: number | null | undefined) {
  return useCanvasData<CoursePage[]>(courseId ? `canvas_pages_${courseId}` : null, () => canvasApi.getPages(courseId!));
}

export function usePage(courseId: number | null | undefined, pageUrl: string | null | undefined) {
  return useCanvasData<CoursePage>(courseId && pageUrl ? `canvas_page_${courseId}_${pageUrl}` : null, () =>
    canvasApi.getPage(courseId!, pageUrl!)
  );
}

export function useFrontPage(courseId: number | null | undefined) {
  return useCanvasData<CoursePage | null>(courseId ? `canvas_front_page_${courseId}` : null, () =>
    canvasApi.getFrontPage(courseId!)
  );
}

/** Root folder of a course, or of the student's personal files when courseId is 'user'. */
export function useRootFolder(context: number | 'user' | null | undefined) {
  return useCanvasData<CanvasFolder>(context ? `canvas_root_folder_${context}` : null, () =>
    context === 'user' ? canvasApi.getUserRootFolder() : canvasApi.getCourseRootFolder(context as number)
  );
}

export function useFolderContents(folderId: number | null | undefined) {
  return useCanvasData<{ folders: CanvasFolder[]; files: CanvasFile[] }>(
    folderId ? `canvas_folder_contents_${folderId}` : null,
    async () => {
      const [folders, files] = await Promise.all([
        canvasApi.getSubfolders(folderId!),
        canvasApi.getFolderFiles(folderId!),
      ]);
      return { folders, files };
    }
  );
}

export function useFileSearch(courseId: number | null | undefined, searchTerm: string) {
  const term = searchTerm.trim();
  return useCanvasData<CanvasFile[]>(
    courseId && term.length >= 2 ? `canvas_file_search_${courseId}_${term}` : null,
    () => canvasApi.searchCourseFiles(courseId!, term)
  );
}

export function useFile(fileId: number | null | undefined) {
  return useCanvasData<CanvasFile>(fileId ? `canvas_file_${fileId}` : null, () => canvasApi.getFile(fileId!));
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export function useConversations(scope: 'inbox' | 'unread' | 'starred' | 'archived' | 'sent' = 'inbox') {
  return useCanvasData<Conversation[]>(`canvas_conversations_${scope}`, () => canvasApi.getConversations(scope));
}

export function useConversation(id: number | null | undefined) {
  return useCanvasData<ConversationDetail>(id ? `canvas_conversation_${id}` : null, () => canvasApi.getConversation(id!));
}

export function useUnreadConversationCount(options?: LoadOptions) {
  const result = useCanvasData<number>('canvas_unread_count', () => canvasApi.getUnreadConversationCount(), options);
  return useMemo(() => ({ ...result, count: result.data ?? 0 }), [result]);
}
