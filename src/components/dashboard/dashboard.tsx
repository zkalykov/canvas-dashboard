'use client';

import Link from 'next/link';
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from 'date-fns';
import { CaretRightIcon, ChatsIcon, ListChecksIcon, MegaphoneSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import {
  useAnnouncements,
  useAssignments,
  useCourseColors,
  useCourseName,
  useCourses,
  useDiscussions,
  useMissingSubmissions,
  useUpcomingAssignments,
  useUser,
} from '@/hooks/use-canvas';
import { useTasks } from '@/hooks/use-tasks';
import { isSubmitted } from '@/lib/submission-status';
import type { Assignment } from '@/lib/types';
import { courseCode, courseTitle } from '@/lib/course-name';
import { cn } from '@/lib/utils';
import { AccountNotices } from './account-notices';
import { warmCourse } from '@/components/layout/preloader';

// Time helpers live outside components so renders stay pure.
function dueWithinWeek(dueAt: string | null) {
  return !!dueAt && differenceInCalendarDays(new Date(dueAt), new Date()) <= 7;
}
function isRecent(date: string | null | undefined, days: number) {
  return !!date && differenceInCalendarDays(new Date(), new Date(date)) <= days;
}
/** Past due, not turned in, within the last `days` days (or flagged missing by Canvas). */
function isOverdue(a: Assignment, days: number) {
  if (!a.due_at || isSubmitted(a.submission) || a.submission?.excused) return false;
  if ((a.submission_types ?? []).some(t => t === 'none' || t === 'on_paper' || t === 'not_graded')) return false;
  const due = new Date(a.due_at).getTime();
  if (due >= Date.now()) return false;
  return Boolean(a.submission?.missing) || differenceInCalendarDays(new Date(), new Date(a.due_at)) <= days;
}
/** Right-hand status for a to-do row, colored when it needs attention. */
function dueStatus(a: Assignment): { text: string; tone?: 'bad' | 'warn' } {
  const due = new Date(a.due_at!);
  if (due.getTime() < Date.now()) {
    return { text: a.submission?.missing ? 'Missing' : `${formatDistanceToNowStrict(due)} late`, tone: 'bad' };
  }
  const hoursLeft = (due.getTime() - Date.now()) / 36e5;
  return { text: formatDistanceToNowStrict(due, { addSuffix: true }), tone: hoursLeft < 24 ? 'warn' : undefined };
}
function fromNow(date: string) {
  return formatDistanceToNowStrict(new Date(date), { addSuffix: true });
}

function Panel({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-card', className)}>
      {title && (
        <div className="flex items-center justify-between gap-4 px-5 pb-0.5 pt-4">
          <h2 className="text-[15px] font-medium">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-2">{children}</div>
    </section>
  );
}

function ViewAll({ href, children = 'View all' }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
      {children}
    </Link>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-[150px] flex-col items-center justify-center px-6 py-6 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{text}</p>
    </div>
  );
}

function Row({
  href,
  leading,
  title,
  subtitle,
  value,
  tone,
  onWarm,
}: {
  href: string;
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  tone?: 'bad' | 'warn';
  /** Start loading the target page's data when the pointer or focus arrives. */
  onWarm?: () => void;
}) {
  return (
    <Link
      href={href}
      onPointerEnter={onWarm}
      onFocus={onWarm}
      onTouchStart={onWarm}
      className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted"
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{title}</span>
        {subtitle && <span className="block truncate text-[13px] text-muted-foreground">{subtitle}</span>}
      </span>
      {value && (
        <span
          className={cn(
            'shrink-0 text-[14px] tabular-nums',
            tone === 'bad' ? 'font-medium text-destructive' : tone === 'warn' ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
          )}
        >
          {value}
        </span>
      )}
      <CaretRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function IconTile({ icon: Icon }: { icon: PhosphorIcon }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border">
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

function RowSkeleton() {
  return (
    <div className="space-y-1 p-1">
      {[0, 1, 2].map(i => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

export function Dashboard() {
  const { data: user } = useUser();
  const { data: upcoming, loading: upcomingLoading } = useUpcomingAssignments();
  const { data: allAssignments, loading: allLoading } = useAssignments();
  const { data: missing } = useMissingSubmissions();
  const { data: courses, loading: coursesLoading } = useCourses();
  // Only counters in "More": they wait until the lists above have loaded.
  const { data: announcements } = useAnnouncements({ deferred: true });
  const { data: discussions } = useDiscussions({ deferred: true });
  const { tasks } = useTasks({ deferred: true });
  const { getColor } = useCourseColors();
  const courseName = useCourseName();

  const firstName = (user?.short_name || user?.name || '').split(' ')[0];
  const open = (upcoming ?? []).filter(a => !isSubmitted(a.submission));
  const overdue = (allAssignments ?? [])
    .filter(a => isOverdue(a, 14))
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
  const todo = [...overdue, ...open];
  const dueThisWeek = open.filter(a => dueWithinWeek(a.due_at)).length;
  const missingCount = missing?.length ?? 0;
  const newAnnouncements = (announcements ?? []).filter(a => a.read_state === 'unread' && isRecent(a.posted_at, 14)).length;
  const activeTopics = (discussions ?? []).filter(d => (d.unread_count || 0) > 0).length;
  const openTasks = tasks.filter(t => !t.completed).length;

  const recentGrades = (allAssignments ?? [])
    .filter(a => a.submission?.score !== null && a.submission?.score !== undefined && a.submission?.graded_at)
    .sort((a, b) => new Date(b.submission!.graded_at!).getTime() - new Date(a.submission!.graded_at!).getTime())
    .slice(0, 5);

  const subline =
    missingCount > 0
      ? `${missingCount} ${missingCount === 1 ? 'assignment is' : 'assignments are'} missing`
      : dueThisWeek > 0
        ? `${dueThisWeek} ${dueThisWeek === 1 ? 'thing' : 'things'} due this week`
        : "You're all caught up";

  return (
    <div className="mx-auto max-w-[820px] space-y-10">
      <header className="pt-4">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight md:text-[30px]">
          Hi{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-[28px] font-semibold leading-tight tracking-tight text-muted-foreground md:text-[30px]">
          {subline}
        </p>
      </header>

      <AccountNotices />

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Panel title="To do" action={<ViewAll href="/assignments" />}>
            {upcomingLoading || allLoading ? (
              <RowSkeleton />
            ) : todo.length === 0 ? (
              <Empty title="Nothing due" text="You're all caught up." />
            ) : (
              todo.slice(0, 6).map(a => {
                const status = dueStatus(a);
                return (
                  <Row
                    key={`${a.course_id}-${a.id}`}
                    href={`/courses/${a.course_id}/assignments/${a.id}`}
                    title={a.name}
                    subtitle={`${courseName(a.course_id)} · ${format(new Date(a.due_at!), 'EEE, MMM d, h:mm a')}`}
                    value={status.text}
                    tone={status.tone}
                  />
                );
              })
            )}
          </Panel>

          <Panel title="Recent grades" action={<ViewAll href="/grades" />}>
            {allLoading ? (
              <RowSkeleton />
            ) : recentGrades.length === 0 ? (
              <Empty title="No grades yet" text="Graded work will show up here." />
            ) : (
              recentGrades.map(a => (
                <Row
                  key={`${a.course_id}-${a.id}`}
                  href={`/courses/${a.course_id}/assignments/${a.id}`}
                  title={a.name}
                  subtitle={`${courseName(a.course_id)} · ${fromNow(a.submission!.graded_at!)}`}
                  value={`${a.submission!.score} / ${a.points_possible ?? '–'}`}
                />
              ))
            )}
          </Panel>
        </div>

        <Panel title="Courses">
          {coursesLoading ? (
            <RowSkeleton />
          ) : (courses ?? []).length === 0 ? (
            <Empty title="No courses" text="Your active courses will show up here." />
          ) : (
            (courses ?? []).map(c => {
              const code = courseCode(c);
              const grade =
                typeof c.currentScore === 'number' ? `${c.currentScore}%${c.currentGrade ? ` ${c.currentGrade}` : ''}` : undefined;
              return (
                <Row
                  key={c.id}
                  href={`/courses/${c.id}`}
                  onWarm={() => warmCourse(c.id)}
                  leading={
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-sm font-semibold text-white"
                      style={{ backgroundColor: getColor(c.id) }}
                    >
                      {courseTitle(c).charAt(0)}
                    </span>
                  }
                  title={courseTitle(c)}
                  subtitle={code ?? undefined}
                  value={grade}
                />
              );
            })
          )}
        </Panel>

        <Panel title="More">
          <Row href="/todo" leading={<IconTile icon={ListChecksIcon} />} title="To-Do" subtitle="Your planner and personal tasks" value={openTasks ? `${openTasks} open` : undefined} />
          <Row
            href="/announcements"
            leading={<IconTile icon={MegaphoneSimpleIcon} />}
            title="Announcements"
            subtitle="Posts from your instructors"
            value={newAnnouncements ? `${newAnnouncements} new` : undefined}
          />
          <Row
            href="/discussions"
            leading={<IconTile icon={ChatsIcon} />}
            title="Discussions"
            subtitle="Class discussion boards"
            value={activeTopics ? `${activeTopics} with new posts` : undefined}
          />
          <Row
            href="/assignments"
            leading={<IconTile icon={WarningCircleIcon} />}
            title="Missing work"
            subtitle="Past-due work you haven't turned in"
            value={missingCount ? String(missingCount) : 'None'}
          />
        </Panel>
      </div>
    </div>
  );
}
