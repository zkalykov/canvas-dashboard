import type {
  User,
  Course,
  Assignment,
  AssignmentGroup,
  CalendarEvent,
  Announcement,
  DiscussionTopic,
  DiscussionEntry,
  DiscussionParticipant,
  DiscussionThread,
  CourseWithGrade,
  Submission,
  Quiz,
  QuizSubmission,
  QuizSubmissionQuestion,
  PlannerItem,
  PlannerNote,
  PlannerOverride,
  CanvasFile,
  CanvasFolder,
  CourseTab,
  CourseModule,
  ModuleItem,
  CoursePage,
  Conversation,
  ConversationDetail,
  Recipient,
  AccountNotification,
} from './types';

/** Error thrown for any non-2xx response from the Canvas proxy. */
export class CanvasApiError extends Error {
  status: number;
  details?: string;

  constructor(status: number, message: string, details?: string) {
    super(message);
    this.name = 'CanvasApiError';
    this.status = status;
    this.details = details;
  }
}

type Json = Record<string, unknown>;

interface CacheEntry<T> {
  promise: Promise<T>;
  expires: number;
}

const CACHE_TTL_MS = 60_000;

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (match) return match[1];
  }
  return null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toDateParam(date: Date): string {
  return date.toISOString();
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

class CanvasAPI {
  // All calls go through our Next.js proxy, which adds the user's token server-side.
  private readonly baseUrl = '/api/canvas';
  private cache = new Map<string, CacheEntry<unknown>>();

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as CacheEntry<T> | undefined;
    if (hit && hit.expires > Date.now()) return hit.promise;
    const promise = load().catch(err => {
      this.cache.delete(key);
      throw err;
    });
    this.cache.set(key, { promise, expires: Date.now() + CACHE_TTL_MS });
    return promise;
  }

  private async send(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && typeof window !== 'undefined') {
      // Session ended (idle, logged out elsewhere or in Telegram): let the app re-check.
      window.dispatchEvent(new Event('canvas:unauthorized'));
    }
    if (!response.ok) {
      let details: string | undefined;
      let message = `Canvas API error: ${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as { error?: string; details?: string };
        details = body.details;
        if (body.error) message = body.error;
      } catch {
        // non-JSON error body
      }
      throw new CanvasApiError(response.status, message, details);
    }
    return response;
  }

  /** Single request; `endpoint` is a Canvas path without the /api/v1 prefix. */
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await this.send(`${this.baseUrl}${endpoint}`, options);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Follows Canvas `Link: rel="next"` pagination and concatenates every page. */
  async requestAll<T>(endpoint: string, { maxPages = 50 }: { maxPages?: number } = {}): Promise<T[]> {
    const results: T[] = [];
    let next: string | null = `${this.baseUrl}${endpoint}`;
    let pages = 0;
    while (next && pages < maxPages) {
      const response = await this.send(next);
      const data = (await response.json()) as unknown;
      if (Array.isArray(data)) results.push(...(data as T[]));
      next = parseNextLink(response.headers.get('Link'));
      pages += 1;
    }
    return results;
  }

  private json(method: string, body?: unknown): RequestInit {
    return body === undefined ? { method } : { method, body: JSON.stringify(body) };
  }

  // ---------------------------------------------------------------------------
  // User
  // ---------------------------------------------------------------------------

  getCurrentUser(): Promise<User> {
    return this.cached('user', () => this.request<User>('/users/self/profile'));
  }

  /** Canvas course colors the student picked, keyed by course id. */
  async getCourseColors(): Promise<Record<number, string>> {
    const data = await this.request<{ custom_colors?: Record<string, string> }>('/users/self/colors');
    const colors: Record<number, string> = {};
    for (const [assetString, hex] of Object.entries(data?.custom_colors ?? {})) {
      const match = assetString.match(/^course_(\d+)$/);
      if (match) colors[Number(match[1])] = hex;
    }
    return colors;
  }

  // ---------------------------------------------------------------------------
  // Courses & grades
  // ---------------------------------------------------------------------------

  /** Active courses with total and grading-period scores (memoized for 60s). */
  getCourses(): Promise<Course[]> {
    return this.cached('courses', () =>
      this.requestAll<Course>(
        '/courses?enrollment_state=active&include[]=total_scores&include[]=current_grading_period_scores&include[]=term&include[]=favorites&per_page=100'
      )
    );
  }

  async getCoursesWithGrades(): Promise<CourseWithGrade[]> {
    const courses = await this.getCourses();
    return courses.map(course => {
      const enrollment = course.enrollments?.find(e => e.type === 'student' || e.type === 'StudentEnrollment');
      return {
        ...course,
        currentGrade: enrollment?.computed_current_grade ?? undefined,
        currentScore: enrollment?.computed_current_score ?? undefined,
        finalGrade: enrollment?.computed_final_grade ?? undefined,
        finalScore: enrollment?.computed_final_score ?? undefined,
      };
    });
  }

  getCourse(courseId: number): Promise<Course> {
    return this.request<Course>(
      `/courses/${courseId}?include[]=total_scores&include[]=current_grading_period_scores&include[]=term&include[]=syllabus_body`
    );
  }

  getCourseTabs(courseId: number): Promise<CourseTab[]> {
    return this.request<CourseTab[]>(`/courses/${courseId}/tabs`);
  }

  getAssignmentGroups(courseId: number): Promise<AssignmentGroup[]> {
    return this.requestAll<AssignmentGroup>(
      `/courses/${courseId}/assignment_groups?include[]=assignments&include[]=submission&per_page=100`
    );
  }

  // ---------------------------------------------------------------------------
  // Assignments & submissions
  // ---------------------------------------------------------------------------

  getAssignments(courseId: number): Promise<Assignment[]> {
    return this.requestAll<Assignment>(`/courses/${courseId}/assignments?include[]=submission&order_by=due_at&per_page=100`);
  }

  getAssignment(courseId: number, assignmentId: number): Promise<Assignment> {
    return this.request<Assignment>(`/courses/${courseId}/assignments/${assignmentId}?include[]=submission`);
  }

  async getAllAssignments(): Promise<Assignment[]> {
    const courses = await this.getCourses();
    const perCourse = await Promise.all(courses.map(course => this.getAssignments(course.id)));
    return perCourse.flat();
  }

  /** Past-due work the student never turned in. */
  getMissingSubmissions(): Promise<(Assignment & { course?: Course })[]> {
    return this.requestAll<Assignment & { course?: Course }>(
      '/users/self/missing_submissions?include[]=course&filter[]=submittable&per_page=100'
    );
  }

  /** The student's own submission with comments, rubric scores and every past attempt. */
  getMySubmission(courseId: number, assignmentId: number): Promise<Submission> {
    return this.request<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/self?include[]=submission_comments&include[]=rubric_assessment&include[]=submission_history`
    );
  }

  addSubmissionComment(courseId: number, assignmentId: number, text: string): Promise<Submission> {
    return this.request<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/self`,
      this.json('PUT', { comment: { text_comment: text } })
    );
  }

  submitAssignment(
    courseId: number,
    assignmentId: number,
    submission: {
      submission_type: 'online_text_entry' | 'online_url' | 'online_upload';
      body?: string;
      url?: string;
      file_ids?: number[];
    }
  ): Promise<Submission> {
    return this.request<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions`,
      this.json('POST', { submission })
    );
  }

  /**
   * Uploads files for a submission. The whole Canvas 3-step upload (request slot,
   * upload bytes, confirm) runs server-side in /api/upload/submission.
   */
  async uploadSubmissionFiles(courseId: number, assignmentId: number, files: File[]): Promise<number[]> {
    const form = new FormData();
    form.append('courseId', String(courseId));
    form.append('assignmentId', String(assignmentId));
    for (const file of files) form.append('file', file);
    const response = await this.send('/api/upload/submission', { method: 'POST', body: form });
    const data = (await response.json()) as { file_ids: number[] };
    return data.file_ids;
  }

  // ---------------------------------------------------------------------------
  // Planner (to-dos with submission status, notes, mark-as-done)
  // ---------------------------------------------------------------------------

  getPlannerItems(options: {
    startDate?: Date;
    endDate?: Date;
    filter?: 'new_activity' | 'incomplete_items' | 'complete_items';
  } = {}): Promise<PlannerItem[]> {
    const params = new URLSearchParams({ per_page: '100' });
    if (options.startDate) params.set('start_date', toDateParam(options.startDate));
    if (options.endDate) params.set('end_date', toDateParam(options.endDate));
    if (options.filter) params.set('filter', options.filter);
    return this.requestAll<PlannerItem>(`/planner/items?${params}`, { maxPages: 10 });
  }

  getPlannerNotes(options: { startDate?: Date; endDate?: Date } = {}): Promise<PlannerNote[]> {
    const params = new URLSearchParams({ per_page: '100' });
    if (options.startDate) params.set('start_date', toDateParam(options.startDate));
    if (options.endDate) params.set('end_date', toDateParam(options.endDate));
    return this.requestAll<PlannerNote>(`/planner_notes?${params}`);
  }

  createPlannerNote(note: { title: string; details?: string; todo_date: string; course_id?: number }): Promise<PlannerNote> {
    return this.request<PlannerNote>('/planner_notes', this.json('POST', note));
  }

  deletePlannerNote(id: number): Promise<PlannerNote> {
    return this.request<PlannerNote>(`/planner_notes/${id}`, { method: 'DELETE' });
  }

  getPlannerOverrides(): Promise<PlannerOverride[]> {
    return this.requestAll<PlannerOverride>('/planner/overrides?per_page=100');
  }

  /**
   * Marks any planner item (assignment, quiz, discussion, page, planner_note,
   * calendar_event...) complete or not complete for the current student.
   */
  async setPlannerItemComplete(
    item: { plannable_type: string; plannable_id: number; planner_override?: PlannerOverride | null },
    complete: boolean
  ): Promise<PlannerOverride> {
    if (item.planner_override) {
      return this.request<PlannerOverride>(
        `/planner/overrides/${item.planner_override.id}`,
        this.json('PUT', { marked_complete: complete })
      );
    }
    return this.request<PlannerOverride>(
      '/planner/overrides',
      this.json('POST', { plannable_type: item.plannable_type, plannable_id: item.plannable_id, marked_complete: complete })
    );
  }

  // ---------------------------------------------------------------------------
  // Calendar
  // ---------------------------------------------------------------------------

  /** Canvas honors at most 10 context codes per request, so we batch them. */
  private async getCalendarEventsOfType(
    type: 'event' | 'assignment',
    contextCodes: string[],
    startDate: string,
    endDate: string
  ): Promise<CalendarEvent[]> {
    const batches = chunk(contextCodes, 10);
    const results = await Promise.all(
      batches.map(batch => {
        const params = new URLSearchParams({ type, start_date: startDate, end_date: endDate, per_page: '100' });
        for (const code of batch) params.append('context_codes[]', code);
        return this.requestAll<CalendarEvent>(`/calendar_events?${params}`);
      })
    );
    return results.flat();
  }

  private async getCalendarContextCodes(): Promise<string[]> {
    const [courses, user] = await Promise.all([this.getCourses(), this.getCurrentUser()]);
    return [`user_${user.id}`, ...courses.map(c => `course_${c.id}`)];
  }

  async getCalendarEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    return this.getCalendarEventsOfType('event', await this.getCalendarContextCodes(), startDate, endDate);
  }

  async getCalendarAssignments(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    const courses = await this.getCourses();
    return this.getCalendarEventsOfType('assignment', courses.map(c => `course_${c.id}`), startDate, endDate);
  }

  async getAllCalendarItems(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    const [events, assignments] = await Promise.all([
      this.getCalendarEvents(startDate, endDate),
      this.getCalendarAssignments(startDate, endDate),
    ]);
    return [...events, ...assignments].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  }

  // ---------------------------------------------------------------------------
  // Announcements & global notices
  // ---------------------------------------------------------------------------

  /**
   * Canvas only returns the last 14 days unless start/end dates are given,
   * so we ask for the past `days` days explicitly.
   */
  async getAnnouncements(days = 180): Promise<Announcement[]> {
    const courses = await this.getCourses();
    if (courses.length === 0) return [];
    const params = new URLSearchParams({
      start_date: toDateParam(daysFromNow(-days)),
      end_date: toDateParam(daysFromNow(1)),
      per_page: '100',
    });
    for (const course of courses) params.append('context_codes[]', `course_${course.id}`);
    const announcements = await this.requestAll<Announcement>(`/announcements?${params}`, { maxPages: 10 });
    return announcements.sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
  }

  /** School-wide notices from the Canvas admins. */
  getAccountNotifications(): Promise<AccountNotification[]> {
    return this.request<AccountNotification[]>('/accounts/self/account_notifications');
  }

  dismissAccountNotification(id: number): Promise<AccountNotification> {
    return this.request<AccountNotification>(`/accounts/self/account_notifications/${id}`, { method: 'DELETE' });
  }

  // ---------------------------------------------------------------------------
  // Discussions
  // ---------------------------------------------------------------------------

  async getDiscussionTopics(courseId: number): Promise<DiscussionTopic[]> {
    const topics = await this.requestAll<DiscussionTopic>(
      `/courses/${courseId}/discussion_topics?order_by=recent_activity&per_page=100`,
      { maxPages: 5 }
    );
    return topics.map(topic => ({ ...topic, course_id: courseId }));
  }

  async getAllDiscussions(): Promise<DiscussionTopic[]> {
    const courses = await this.getCourses();
    const perCourse = await Promise.all(courses.map(course => this.getDiscussionTopics(course.id)));
    return perCourse.flat().sort((a, b) => {
      const dateA = a.last_reply_at || a.posted_at;
      const dateB = b.last_reply_at || b.posted_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }

  async getDiscussionTopic(courseId: number, topicId: number): Promise<DiscussionTopic> {
    const topic = await this.request<DiscussionTopic>(`/courses/${courseId}/discussion_topics/${topicId}`);
    return { ...topic, course_id: courseId };
  }

  /**
   * Full threaded discussion. Uses the /view endpoint (entire reply tree) and
   * falls back to /entries (top-level posts + recent replies) if the view is
   * still being generated. Throws CanvasApiError 403 with details
   * "require_initial_post" when the student must post before seeing replies.
   */
  async getDiscussionThread(courseId: number, topicId: number): Promise<DiscussionThread> {
    type RawEntry = Json & {
      id: number;
      user_id?: number | null;
      parent_id?: number | null;
      message?: string | null;
      deleted?: boolean;
      replies?: RawEntry[];
      recent_replies?: RawEntry[];
    };
    type RawView = {
      participants?: DiscussionParticipant[];
      unread_entries?: number[];
      view?: RawEntry[];
      new_entries?: RawEntry[];
    };

    let raw: RawView | null = null;
    for (let attempt = 0; attempt < 2 && !raw; attempt++) {
      try {
        raw = await this.request<RawView>(
          `/courses/${courseId}/discussion_topics/${topicId}/view?include_new_entries=1`
        );
      } catch (err) {
        if (err instanceof CanvasApiError && err.status === 503 && attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          continue;
        }
        if (err instanceof CanvasApiError && err.status === 403) throw err;
        break;
      }
    }

    const participants: Record<number, DiscussionParticipant> = {};
    const unread = new Set<number>(raw?.unread_entries ?? []);

    const normalize = (entry: RawEntry): DiscussionEntry => {
      const user = entry.user_id ? participants[entry.user_id] : undefined;
      const children = entry.replies ?? entry.recent_replies ?? [];
      return {
        id: entry.id,
        user_id: entry.user_id ?? 0,
        parent_id: entry.parent_id ?? null,
        created_at: String(entry.created_at ?? ''),
        updated_at: String(entry.updated_at ?? ''),
        message: entry.deleted ? '' : entry.message ?? '',
        user_name: user?.display_name ?? (typeof entry.user_name === 'string' ? entry.user_name : 'Unknown user'),
        user: user
          ? { id: user.id, display_name: user.display_name, avatar_image_url: user.avatar_image_url ?? '', html_url: user.html_url }
          : undefined,
        rating_sum: typeof entry.rating_sum === 'number' ? entry.rating_sum : undefined,
        rating_count: typeof entry.rating_count === 'number' ? entry.rating_count : undefined,
        has_more_replies: Boolean(entry.has_more_replies),
        deleted: Boolean(entry.deleted),
        unread: unread.has(entry.id),
        replies: [...children]
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
          .map(normalize),
      };
    };

    if (raw) {
      for (const p of raw.participants ?? []) participants[p.id] = p;
      const entries = (raw.view ?? []).map(normalize);

      // Merge entries created after Canvas cached the view.
      const index = new Map<number, DiscussionEntry>();
      const walk = (list: DiscussionEntry[]) => list.forEach(e => { index.set(e.id, e); walk(e.replies ?? []); });
      walk(entries);
      for (const rawNew of raw.new_entries ?? []) {
        if (index.has(rawNew.id)) continue;
        const entry = normalize({ ...rawNew, replies: [] });
        const parent = entry.parent_id ? index.get(entry.parent_id) : undefined;
        if (parent) parent.replies = [...(parent.replies ?? []), entry];
        else entries.push(entry);
        index.set(entry.id, entry);
      }
      return { entries, unreadEntryIds: [...unread], participants };
    }

    // Fallback: top-level entries with up to 10 recent replies each.
    const topLevel = await this.requestAll<RawEntry>(
      `/courses/${courseId}/discussion_topics/${topicId}/entries?per_page=100`
    );
    return { entries: topLevel.map(normalize), unreadEntryIds: [], participants };
  }

  postDiscussionReply(courseId: number, topicId: number, message: string, entryId?: number): Promise<DiscussionEntry> {
    const endpoint = entryId
      ? `/courses/${courseId}/discussion_topics/${topicId}/entries/${entryId}/replies`
      : `/courses/${courseId}/discussion_topics/${topicId}/entries`;
    return this.request<DiscussionEntry>(endpoint, this.json('POST', { message }));
  }

  markDiscussionTopicRead(courseId: number, topicId: number): Promise<void> {
    return this.request<void>(`/courses/${courseId}/discussion_topics/${topicId}/read_all`, { method: 'PUT' });
  }

  // ---------------------------------------------------------------------------
  // Classic quizzes (New Quizzes have no student API; they are external_tool assignments)
  // ---------------------------------------------------------------------------

  getQuiz(courseId: number, quizId: number): Promise<Quiz> {
    return this.request<Quiz>(`/courses/${courseId}/quizzes/${quizId}`);
  }

  /** The student's latest attempt for this quiz, if any. */
  async getMyQuizSubmission(courseId: number, quizId: number): Promise<QuizSubmission | null> {
    try {
      const data = await this.request<{ quiz_submissions?: QuizSubmission[] }>(
        `/courses/${courseId}/quizzes/${quizId}/submission`
      );
      return data?.quiz_submissions?.[0] ?? null;
    } catch (err) {
      if (err instanceof CanvasApiError && err.status === 404) return null;
      throw err;
    }
  }

  async startQuizSubmission(courseId: number, quizId: number, accessCode?: string): Promise<QuizSubmission> {
    const data = await this.request<{ quiz_submissions: QuizSubmission[] }>(
      `/courses/${courseId}/quizzes/${quizId}/submissions`,
      this.json('POST', accessCode ? { access_code: accessCode } : {})
    );
    return data.quiz_submissions[0];
  }

  /** Student-facing way to read questions (and saved answers) for an attempt. */
  async getQuizSubmissionQuestions(quizSubmissionId: number): Promise<QuizSubmissionQuestion[]> {
    const data = await this.request<{ quiz_submission_questions: QuizSubmissionQuestion[] }>(
      `/quiz_submissions/${quizSubmissionId}/questions`
    );
    return data.quiz_submission_questions ?? [];
  }

  /**
   * Saves answers. Formats: multiple_choice/true_false -> answer id (number);
   * essay/short_answer -> string; multiple_answers -> number[];
   * matching -> {answer_id, match_id}[]; numerical -> number.
   */
  async answerQuizQuestions(
    quizSubmissionId: number,
    params: { attempt: number; validation_token: string; access_code?: string },
    answers: { id: number; answer: unknown }[]
  ): Promise<QuizSubmissionQuestion[]> {
    const data = await this.request<{ quiz_submission_questions: QuizSubmissionQuestion[] }>(
      `/quiz_submissions/${quizSubmissionId}/questions`,
      this.json('POST', { ...params, quiz_questions: answers })
    );
    return data.quiz_submission_questions ?? [];
  }

  async completeQuizSubmission(
    courseId: number,
    quizId: number,
    quizSubmissionId: number,
    params: { attempt: number; validation_token: string; access_code?: string }
  ): Promise<QuizSubmission> {
    const data = await this.request<{ quiz_submissions: QuizSubmission[] }>(
      `/courses/${courseId}/quizzes/${quizId}/submissions/${quizSubmissionId}/complete`,
      this.json('POST', params)
    );
    return data.quiz_submissions[0];
  }

  // ---------------------------------------------------------------------------
  // Files & folders (see src/lib/files.ts for preview/download URLs)
  // ---------------------------------------------------------------------------

  getCourseRootFolder(courseId: number): Promise<CanvasFolder> {
    return this.request<CanvasFolder>(`/courses/${courseId}/folders/root`);
  }

  getUserRootFolder(): Promise<CanvasFolder> {
    return this.request<CanvasFolder>('/users/self/folders/root');
  }

  getSubfolders(folderId: number): Promise<CanvasFolder[]> {
    return this.requestAll<CanvasFolder>(`/folders/${folderId}/folders?per_page=100`);
  }

  getFolderFiles(folderId: number): Promise<CanvasFile[]> {
    return this.requestAll<CanvasFile>(`/folders/${folderId}/files?per_page=100&sort=name`);
  }

  /** search_term must be at least 2 characters (Canvas rule). */
  searchCourseFiles(courseId: number, searchTerm: string): Promise<CanvasFile[]> {
    const params = new URLSearchParams({ search_term: searchTerm, per_page: '100', sort: 'name' });
    return this.requestAll<CanvasFile>(`/courses/${courseId}/files?${params}`, { maxPages: 5 });
  }

  getFile(fileId: number): Promise<CanvasFile> {
    return this.request<CanvasFile>(`/files/${fileId}`);
  }

  /** Every file in a course (fails with 401/403 when the course hides its Files page). */
  getCourseFiles(courseId: number): Promise<CanvasFile[]> {
    return this.requestAll<CanvasFile>(`/courses/${courseId}/files?per_page=100&sort=name`);
  }

  /** Every folder in a course, with its full path ("course files/Lectures"). */
  getCourseFolders(courseId: number): Promise<CanvasFolder[]> {
    return this.requestAll<CanvasFolder>(`/courses/${courseId}/folders?per_page=100`);
  }

  // ---------------------------------------------------------------------------
  // Modules & pages
  // ---------------------------------------------------------------------------

  /** Modules with their items; fetches items separately when Canvas omits them. */
  async getModules(courseId: number): Promise<CourseModule[]> {
    const modules = await this.requestAll<CourseModule>(
      `/courses/${courseId}/modules?include[]=items&include[]=content_details&per_page=100`
    );
    return Promise.all(
      modules.map(async module => {
        if (module.items || module.items_count === 0) return module;
        const items = await this.requestAll<ModuleItem>(
          `/courses/${courseId}/modules/${module.id}/items?include[]=content_details&per_page=100`
        );
        return { ...module, items };
      })
    );
  }

  getPages(courseId: number): Promise<CoursePage[]> {
    return this.requestAll<CoursePage>(`/courses/${courseId}/pages?sort=title&per_page=100`);
  }

  getPage(courseId: number, pageUrlOrId: string): Promise<CoursePage> {
    return this.request<CoursePage>(`/courses/${courseId}/pages/${encodeURIComponent(pageUrlOrId)}`);
  }

  async getFrontPage(courseId: number): Promise<CoursePage | null> {
    try {
      return await this.request<CoursePage>(`/courses/${courseId}/front_page`);
    } catch (err) {
      if (err instanceof CanvasApiError && (err.status === 404 || err.status === 401)) return null;
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Inbox (conversations)
  // ---------------------------------------------------------------------------

  getConversations(scope: 'inbox' | 'unread' | 'starred' | 'archived' | 'sent' = 'inbox'): Promise<Conversation[]> {
    const params = new URLSearchParams({ per_page: '50' });
    params.append('include[]', 'participant_avatars');
    if (scope !== 'inbox') params.set('scope', scope);
    return this.requestAll<Conversation>(`/conversations?${params}`, { maxPages: 4 });
  }

  /** Opening a conversation marks it read in Canvas. */
  getConversation(id: number): Promise<ConversationDetail> {
    return this.request<ConversationDetail>(`/conversations/${id}`);
  }

  async getUnreadConversationCount(): Promise<number> {
    const data = await this.request<{ unread_count: string | number }>('/conversations/unread_count');
    return Number(data?.unread_count ?? 0);
  }

  replyToConversation(id: number, body: string): Promise<ConversationDetail> {
    return this.request<ConversationDetail>(`/conversations/${id}/add_message`, this.json('POST', { body }));
  }

  updateConversation(
    id: number,
    changes: { workflow_state?: 'read' | 'unread' | 'archived'; starred?: boolean }
  ): Promise<Conversation> {
    return this.request<Conversation>(`/conversations/${id}`, this.json('PUT', { conversation: changes }));
  }

  /** Finds people/courses a student may message. `context` like "course_123". */
  searchRecipients(search: string, context?: string): Promise<Recipient[]> {
    const params = new URLSearchParams({ search, per_page: '20' });
    if (context) params.set('context', context);
    return this.request<Recipient[]>(`/search/recipients?${params}`);
  }

  createConversation(message: {
    recipients: string[];
    subject?: string;
    body: string;
    context_code?: string;
    group_conversation?: boolean;
  }): Promise<ConversationDetail[]> {
    return this.request<ConversationDetail[]>('/conversations', this.json('POST', message));
  }
}

export const canvasApi = new CanvasAPI();
export default canvasApi;
