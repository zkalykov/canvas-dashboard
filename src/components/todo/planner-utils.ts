'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSWRConfig, type KeyedMutator } from 'swr';
import { addDays, format, isToday, isTomorrow, isYesterday, startOfDay, subDays } from 'date-fns';
import { BookOpenIcon, CalendarDotsIcon, ChatsIcon, ClipboardTextIcon, FileTextIcon, MegaphoneSimpleIcon, NoteIcon, RecordIcon } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth-context';
import canvasApi, { CanvasApiError } from '@/lib/canvas-api';
import { useCourses } from '@/hooks/use-canvas';
import type { PlannerItem, PlannerOverride } from '@/lib/types';
import { courseTitle } from '@/lib/course-name';

// ---------------------------------------------------------------------------
// Types & identity
// ---------------------------------------------------------------------------

/** 'PlannerNote' / 'planner_note' / 'DiscussionTopic' -> snake_case. */
export function normalizePlannableType(type: string | null | undefined): string {
  return (type ?? '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function isPlannerNote(item: Pick<PlannerItem, 'plannable_type'>): boolean {
  return normalizePlannableType(item.plannable_type) === 'planner_note';
}

export function plannerItemKey(item: Pick<PlannerItem, 'plannable_type' | 'plannable_id'>): string {
  return `${normalizePlannableType(item.plannable_type)}_${item.plannable_id}`;
}

const TYPE_META: Record<string, { icon: PhosphorIcon; label: string }> = {
  assignment: { icon: FileTextIcon, label: 'Assignment' },
  sub_assignment: { icon: FileTextIcon, label: 'Assignment' },
  quiz: { icon: ClipboardTextIcon, label: 'Quiz' },
  discussion_topic: { icon: ChatsIcon, label: 'Discussion' },
  wiki_page: { icon: BookOpenIcon, label: 'Page' },
  planner_note: { icon: NoteIcon, label: 'Personal task' },
  calendar_event: { icon: CalendarDotsIcon, label: 'Event' },
  announcement: { icon: MegaphoneSimpleIcon, label: 'Announcement' },
};

export function plannerTypeMeta(type: string): { icon: PhosphorIcon; label: string } {
  return TYPE_META[normalizePlannableType(type)] ?? { icon: RecordIcon, label: 'To-do' };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function plannerItemDate(item: PlannerItem): Date | null {
  const raw = item.plannable?.due_at || item.plannable?.todo_date || item.plannable_date;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dayLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMM d');
}

/** "Today", "Tomorrow", "Yesterday", else "Mon, Sep 21". */
export function shortDayLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEE, MMM d');
}

/** "Due 11:59 PM", "To-do 9:00 AM", "Posted 3:00 PM"; with a day prefix when `withDate`. */
export function plannerTimeLabel(item: PlannerItem, withDate = false): string | null {
  const date = plannerItemDate(item);
  if (!date) return null;
  const type = normalizePlannableType(item.plannable_type);
  const when = withDate ? `${shortDayLabel(date)}, ${format(date, 'h:mm a')}` : format(date, 'h:mm a');
  if (item.plannable?.due_at) return `Due ${when}`;
  if (type === 'announcement') return `Posted ${when}`;
  if (type === 'calendar_event') return when;
  return `To-do ${when}`;
}

/** The window the to-do page and dashboard card share (same SWR key, same cache). */
export function plannerRange(): { start: string; end: string; today: Date } {
  const today = startOfDay(new Date());
  return {
    start: subDays(today, 14).toISOString(),
    end: addDays(today, 21).toISOString(),
    today,
  };
}

/** Computed once per mount so the SWR key stays stable across renders. */
export function usePlannerRange() {
  const [range] = useState(plannerRange);
  return range;
}

// ---------------------------------------------------------------------------
// Completion & status
// ---------------------------------------------------------------------------

/** Canvas planner logic: an override wins; otherwise submitted / excused / graded counts as done. */
export function isPlannerItemDone(item: PlannerItem): boolean {
  if (item.planner_override) return Boolean(item.planner_override.marked_complete);
  const s = item.submissions;
  return Boolean(s && (s.submitted || s.excused || s.graded));
}

/** Items that can be "overdue" (events and announcements cannot). */
export function canBeOverdue(item: PlannerItem): boolean {
  const type = normalizePlannableType(item.plannable_type);
  return type !== 'calendar_event' && type !== 'announcement';
}

export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'muted';

export function plannerStatusBadges(item: PlannerItem): { label: string; tone: StatusTone }[] {
  const s = item.submissions;
  if (!s) return [];
  const badges: { label: string; tone: StatusTone }[] = [];
  if (s.excused) badges.push({ label: 'Excused', tone: 'muted' });
  else if (s.graded) badges.push({ label: 'Graded', tone: 'success' });
  else if (s.submitted) badges.push({ label: 'Submitted', tone: 'success' });
  if (s.missing) badges.push({ label: 'Missing', tone: 'danger' });
  if (s.late) badges.push({ label: 'Late', tone: 'warning' });
  if (s.with_feedback || s.has_feedback) badges.push({ label: 'Feedback', tone: 'info' });
  return badges;
}

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  success: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  muted: 'border-border bg-muted text-muted-foreground',
};

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export function toCanvasUrl(url: string | null | undefined, canvasUrl: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  if (!canvasUrl) return null;
  const base = (canvasUrl.startsWith('http') ? canvasUrl : `https://${canvasUrl}`).replace(/\/+$/, '');
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

/** In-app route when we have one, otherwise the Canvas page in a new tab. */
export function plannerItemLink(
  item: PlannerItem,
  canvasUrl: string | null
): { href: string; external: boolean } | null {
  const type = normalizePlannableType(item.plannable_type);
  const courseId = item.course_id;
  if (courseId) {
    if (type === 'assignment') return { href: `/courses/${courseId}/assignments/${item.plannable_id}`, external: false };
    if (type === 'quiz') return { href: `/courses/${courseId}/quizzes/${item.plannable_id}`, external: false };
    if (type === 'discussion_topic' || type === 'announcement') {
      return { href: `/courses/${courseId}/discussions/${item.plannable_id}`, external: false };
    }
  }
  if (type === 'planner_note') return null; // html_url points at the API
  const href = toCanvasUrl(item.html_url, canvasUrl);
  return href ? { href, external: true } : null;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Short course label (course code, else name, else the planner's context_name). */
export function useCourseLabel() {
  const { data: courses } = useCourses();
  const byId = useMemo(() => new Map((courses ?? []).map(c => [c.id, c])), [courses]);
  return useCallback(
    (courseId: number | null | undefined, fallback?: string | null) => {
      const course = courseId ? byId.get(courseId) : undefined;
      return course ? courseTitle(course) : fallback || '';
    },
    [byId]
  );
}

function optimisticOverride(item: PlannerItem, complete: boolean): PlannerOverride {
  const now = new Date().toISOString();
  return item.planner_override
    ? { ...item.planner_override, marked_complete: complete }
    : {
        id: 0,
        plannable_type: item.plannable_type,
        plannable_id: item.plannable_id,
        user_id: 0,
        workflow_state: 'active',
        marked_complete: complete,
        dismissed: false,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
}

/**
 * Mark planner items done / not done in Canvas with an optimistic update.
 * `touched` remembers what the student ticked this session so a just-completed
 * row can stay visible (struck through) instead of vanishing mid-click.
 */
export function usePlannerToggle(mutate: KeyedMutator<PlannerItem[]>) {
  const { mutate: globalMutate } = useSWRConfig();
  const { isViewOnly } = useAuth();
  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(
    async (item: PlannerItem, complete: boolean) => {
      const key = plannerItemKey(item);
      if (isViewOnly || pendingRef.current.has(key)) return;
      pendingRef.current.add(key);
      setPending(new Set(pendingRef.current));
      setTouched(prev => new Set(prev).add(key));
      setError(null);

      const apply = (items: PlannerItem[] | undefined, override: PlannerOverride) =>
        (items ?? []).map(i => (plannerItemKey(i) === key ? { ...i, planner_override: override } : i));

      try {
        await mutate(
          async current => {
            const existing = item.planner_override && item.planner_override.id > 0 ? item.planner_override : null;
            const saved = await canvasApi.setPlannerItemComplete(
              { plannable_type: item.plannable_type, plannable_id: item.plannable_id, planner_override: existing },
              complete
            );
            return apply(current, saved);
          },
          {
            optimisticData: current => apply(current, optimisticOverride(item, complete)),
            rollbackOnError: true,
            populateCache: true,
            revalidate: false,
          }
        );
        // Personal tasks read overrides; other planner windows may hold the same item.
        void globalMutate(k => typeof k === 'string' && k.startsWith('canvas_planner_'));
      } catch (err) {
        setError(
          err instanceof CanvasApiError || err instanceof Error
            ? `Couldn't update Canvas: ${err.message}`
            : "Couldn't update Canvas"
        );
      } finally {
        pendingRef.current.delete(key);
        setPending(new Set(pendingRef.current));
      }
    },
    [isViewOnly, mutate, globalMutate]
  );

  return { toggle, pending, touched, error };
}

/** Current time, refreshed every minute (keeps "overdue" honest on a long-open tab). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
