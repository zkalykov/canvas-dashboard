'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import {
  useAccountNotifications,
  useAnnouncements,
  useAssignmentGroups,
  useAssignments,
  useCalendar,
  useConversations,
  useCourse,
  useCourses,
  useDiscussions,
  useFolderContents,
  useFrontPage,
  useMissingSubmissions,
  usePlannerItems,
  usePlannerNotes,
  usePlannerOverrides,
  useRootFolder,
  useUnreadConversationCount,
} from '@/hooks/use-canvas';
import { useVisibleCourseTabs } from '@/components/course/course-tabs';
import { summarizeCourseScore, getStudentEnrollment, usePeriodAssignmentGroups } from '@/components/grades/grades-data';
import { plannerRange } from '@/components/todo/planner-utils';
import { armFirstScreen, useFirstScreenSettled } from '@/lib/first-screen';

/**
 * Loads, in the background, what the other pages show first, so opening them is instant.
 *
 * Nothing starts until the current page has its data (first-screen.ts) and the browser
 * is idle; then two pages at a time. Each unit mounts the very hooks its page uses
 * (same keys), so the page later finds the data in the SWR cache. Only list-level
 * data is loaded: never a single conversation or discussion (opening those can mark
 * them read in Canvas).
 *
 * Pointing at a course (hover, focus, touch) loads that course right away.
 */

type UnitProps = { onDone: () => void };

function useDone(done: boolean, onDone: () => void) {
  useEffect(() => {
    if (done) onDone();
  }, [done, onDone]);
}

/** Home: the to-do list, missing work and school notices (when you started on another page). */
function HomeUnit({ onDone }: UnitProps) {
  const assignments = useAssignments();
  const missing = useMissingSubmissions();
  const notices = useAccountNotifications();
  useDone(!assignments.loading && !missing.loading && !notices.loading, onDone);
  return null;
}

/** Home's counters: open tasks and unread messages. */
function CountsUnit({ onDone }: UnitProps) {
  const notes = usePlannerNotes();
  const overrides = usePlannerOverrides();
  const unread = useUnreadConversationCount();
  useDone(!notes.loading && !overrides.loading && !unread.loading, onDone);
  return null;
}

function AnnouncementsUnit({ onDone }: UnitProps) {
  useDone(!useAnnouncements().loading, onDone);
  return null;
}

function DiscussionsUnit({ onDone }: UnitProps) {
  useDone(!useDiscussions().loading, onDone);
  return null;
}

function monthRange() {
  const today = new Date();
  return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
}

/** Calendar opens on this month. */
function CalendarUnit({ onDone }: UnitProps) {
  const [range] = useState(monthRange);
  useDone(!useCalendar(range.start, range.end).loading, onDone);
  return null;
}

/** Inbox list only (never a single conversation: reading one can mark it read). */
function InboxUnit({ onDone }: UnitProps) {
  useDone(!useConversations('inbox').loading, onDone);
  return null;
}

/** Grades opens on the first course, scoped to its current grading period when it has one. */
function GradesUnit({ onDone }: UnitProps) {
  const courses = useCourses();
  const first = (courses.data ?? []).find(course => getStudentEnrollment(course));
  const periodId = first && summarizeCourseScore(first).hasPeriods ? (getStudentEnrollment(first)?.current_grading_period_id ?? null) : null;
  const all = useAssignmentGroups(first && periodId === null ? first.id : null);
  const period = usePeriodAssignmentGroups(first?.id, periodId);
  const detail = useCourse(first?.id);
  const groupsLoading = periodId === null ? all.loading : period.loading;
  useDone(!courses.loading && (!first || (!groupsLoading && !detail.loading)), onDone);
  return null;
}

/** Files opens on the first course's top folder. */
function FilesUnit({ onDone }: UnitProps) {
  const courses = useCourses();
  const context = courses.data ? (courses.data[0]?.id ?? 'user') : courses.error ? 'user' : null;
  const root = useRootFolder(context);
  const contents = useFolderContents(root.data?.id);
  useDone(context !== null && (!!root.error || (!root.loading && !contents.loading && !!root.data)), onDone);
  return null;
}

/** To-Do shows two weeks back to three weeks ahead. */
function TodoUnit({ onDone }: UnitProps) {
  const [range] = useState(plannerRange);
  useDone(!usePlannerItems(range.start, range.end).loading, onDone);
  return null;
}

/** A course's home: the course (with syllabus), its tabs, and its front page when that is the home. */
function CourseUnit({ id, onDone }: UnitProps & { id: number }) {
  const course = useCourse(id);
  const tabs = useVisibleCourseTabs(id);
  const data = course.data;
  const modulesVisible = tabs.visible.some(tab => tab.id === 'modules');
  const needFrontPage =
    !!data &&
    !tabs.loading &&
    !(data.default_view === 'modules' && modulesVisible) &&
    !(data.default_view === 'syllabus' && Boolean(data.syllabus_body?.trim()));
  const frontPage = useFrontPage(needFrontPage ? id : null);
  useDone(!course.loading && !tabs.loading && !frontPage.loading, onDone);
  return null;
}

// ---------------------------------------------------------------------------
// Courses someone pointed at: load now, ahead of the queue
// ---------------------------------------------------------------------------

let warmed: number[] = [];
const warmListeners = new Set<() => void>();

/** Call on hover/focus/touch of a link to a course. */
export function warmCourse(id: number) {
  if (warmed.includes(id)) return;
  warmed = [...warmed, id];
  warmListeners.forEach(listener => listener());
}

function subscribeWarm(listener: () => void) {
  warmListeners.add(listener);
  return () => warmListeners.delete(listener);
}

const noCourses: number[] = [];

// ---------------------------------------------------------------------------

const PAGES = [
  { id: 'home', Unit: HomeUnit },
  { id: 'counts', Unit: CountsUnit },
  { id: 'announcements', Unit: AnnouncementsUnit },
  { id: 'calendar', Unit: CalendarUnit },
  { id: 'inbox', Unit: InboxUnit },
  { id: 'grades', Unit: GradesUnit },
  { id: 'files', Unit: FilesUnit },
  { id: 'discussions', Unit: DiscussionsUnit },
  { id: 'todo', Unit: TodoUnit },
];

/** How many pages load at the same time in the background. */
const PARALLEL = 2;

export function Preloader() {
  const settled = useFirstScreenSettled();
  const [idle, setIdle] = useState(false);
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  const { data: courses } = useCourses();
  const pointedAt = useSyncExternalStore(subscribeWarm, () => warmed, () => noCourses);

  useEffect(() => {
    armFirstScreen();
  }, []);

  // Start once the first screen has its data and the browser has a free moment.
  useEffect(() => {
    if (!settled || idle) return;
    const start = () => setIdle(true);
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(start, { timeout: 1500 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(start, 200);
    return () => clearTimeout(timer);
  }, [settled, idle]);

  const markDone = useCallback((id: string) => {
    setDone(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const queue = [
    ...PAGES.map(({ id, Unit }) => ({ id, render: (onDone: () => void) => <Unit key={id} onDone={onDone} /> })),
    ...(courses ?? []).map(course => {
      const id = `course-${course.id}`;
      return { id, render: (onDone: () => void) => <CourseUnit key={id} id={course.id} onDone={onDone} /> };
    }),
  ];
  // Keep finished units mounted (cheap, cached) and at most PARALLEL unfinished ones.
  const running: typeof queue = [];
  let unfinished = 0;
  for (const item of idle ? queue : []) {
    running.push(item);
    if (!done.has(item.id) && ++unfinished >= PARALLEL) break;
  }
  const runningIds = new Set(running.map(item => item.id));

  return (
    <>
      {running.map(item => item.render(() => markDone(item.id)))}
      {pointedAt
        .filter(courseId => !runningIds.has(`course-${courseId}`))
        .map(courseId => (
          <CourseUnit key={`warm-${courseId}`} id={courseId} onDone={() => markDone(`course-${courseId}`)} />
        ))}
    </>
  );
}
