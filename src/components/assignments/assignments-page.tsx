'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { CaretRightIcon } from '@phosphor-icons/react';
import { useAssignments, useCourseColors, useCourseName } from '@/hooks/use-canvas';
import { Skeleton } from '@/components/ui/skeleton';
import { assignmentState, type AssignmentState } from '@/lib/submission-status';
import type { Assignment } from '@/lib/types';
import { cn } from '@/lib/utils';

type Filter = 'upcoming' | 'past' | 'submitted' | 'missing' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'missing', label: 'Missing' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
];

// Time helpers live outside components so renders stay pure.
function isPastDue(a: Assignment) {
  return a.due_at !== null && new Date(a.due_at).getTime() < Date.now();
}

function hoursUntil(dueAt: string) {
  return (new Date(dueAt).getTime() - Date.now()) / 36e5;
}

function matchesFilter(a: Assignment, filter: Filter, state: AssignmentState) {
  switch (filter) {
    case 'upcoming':
      return !isPastDue(a); // includes undated and already-submitted work
    case 'past':
      return isPastDue(a);
    case 'submitted':
      return state === 'submitted';
    case 'missing':
      return state === 'missing' || state === 'overdue';
    default:
      return true;
  }
}

/** The one status on the right of a row; colored only when it needs attention. */
function rowStatus(a: Assignment): { text: string; tone: 'good' | 'bad' | 'warn' | 'muted' } {
  const state = assignmentState(a);
  const sub = a.submission;
  const graded = sub?.score !== null && sub?.score !== undefined;
  if (state === 'submitted') {
    if (sub?.excused) return { text: 'Excused', tone: 'muted' };
    if (graded) return { text: `${sub?.score} / ${a.points_possible ?? '–'}`, tone: 'good' };
    return { text: 'Submitted', tone: 'good' };
  }
  if (state === 'missing') return { text: 'Missing', tone: 'bad' };
  if (state === 'overdue') return { text: `${formatDistanceToNowStrict(new Date(a.due_at!))} late`, tone: 'bad' };
  if (state === 'undated') return { text: 'No due date', tone: 'muted' };
  const text = formatDistanceToNowStrict(new Date(a.due_at!), { addSuffix: true });
  return { text, tone: hoursUntil(a.due_at!) < 24 ? 'warn' : 'muted' };
}

export function AssignmentsPage() {
  const { data: assignments, loading, error } = useAssignments();
  const { getColor } = useCourseColors();
  const getCourseName = useCourseName();
  const [filter, setFilter] = useState<Filter>('upcoming');

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { upcoming: 0, past: 0, submitted: 0, missing: 0, all: 0 };
    for (const a of assignments ?? []) {
      const state = assignmentState(a);
      for (const f of FILTERS) if (matchesFilter(a, f.value, state)) result[f.value] += 1;
    }
    return result;
  }, [assignments]);

  const list = useMemo(() => {
    const filtered = (assignments ?? []).filter(a => matchesFilter(a, filter, assignmentState(a)));
    // Past lists read best newest-first; everything else soonest-first.
    const direction = filter === 'past' || filter === 'submitted' ? -1 : 1;
    return filtered.sort((a, b) => {
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return direction * (new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
    });
  }, [assignments, filter]);

  return (
    <div className="mx-auto max-w-[820px] space-y-6">
      <h1 className="text-[22px] font-semibold tracking-tight">Assignments</h1>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[14px] transition-colors',
              filter === f.value ? 'bg-foreground text-background' : 'bg-muted text-foreground/80 hover:bg-accent'
            )}
          >
            {f.label}
            <span className={cn('ml-1.5 tabular-nums', filter === f.value ? 'opacity-70' : 'text-muted-foreground')}>
              {counts[f.value]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-1 rounded-2xl bg-muted/70 p-1.5">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border px-6 py-10 text-center">
          <p className="text-[15px] font-medium">Couldn&apos;t load assignments</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Check your connection and reload the page.</p>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border px-6 py-12 text-center">
          <p className="text-[15px] font-medium">Nothing here</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {filter === 'missing' ? "You haven't missed anything." : 'No assignments match this filter.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-muted/70 p-1.5">
          {list.map(a => {
            const status = rowStatus(a);
            return (
              <Link
                key={`${a.course_id}-${a.id}`}
                href={`/courses/${a.course_id}/assignments/${a.id}`}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-background/70"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getColor(a.course_id) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{a.name}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {getCourseName(a.course_id)}
                    {a.due_at ? ` · Due ${format(new Date(a.due_at), 'EEE, MMM d, h:mm a')}` : ''}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-[14px] tabular-nums',
                    status.tone === 'bad' && 'font-medium text-destructive',
                    status.tone === 'warn' && 'font-medium text-amber-600 dark:text-amber-400',
                    status.tone === 'good' && 'text-success',
                    status.tone === 'muted' && 'text-muted-foreground'
                  )}
                >
                  {status.text}
                </span>
                <CaretRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
