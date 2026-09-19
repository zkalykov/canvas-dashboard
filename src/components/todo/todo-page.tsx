'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { format, isToday, isTomorrow } from 'date-fns';
import { ArrowClockwiseIcon, CheckCircleIcon, CircleNotchIcon, PlusIcon } from '@phosphor-icons/react';
import { useCourses, useMissingSubmissions, usePlannerItems } from '@/hooks/use-canvas';
import { useTasks } from '@/hooks/use-tasks';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { MissingAssignmentRow, type MissingAssignment } from './missing-assignment-row';
import { ViewOnlyNote } from '@/components/shared/view-only-note';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import type { PlannerItem } from '@/lib/types';
import { PersonalTaskRow, PlannerItemRow } from './todo-rows';
import {
  canBeOverdue,
  dayLabel,
  isPlannerItemDone,
  isPlannerNote,
  normalizePlannableType,
  plannerItemDate,
  plannerItemKey,
  useNow,
  usePlannerRange,
  usePlannerToggle,
} from './planner-utils';
import { courseTitle } from '@/lib/course-name';

type OverdueEntry =
  | { kind: 'missing'; key: string; time: number; assignment: MissingAssignment }
  | { kind: 'planner'; key: string; time: number; item: PlannerItem };

const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm dark:bg-input/30 [&_option]:bg-popover [&_option]:text-popover-foreground';

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function CountBadge({ count, tone = 'secondary' }: { count: number; tone?: 'secondary' | 'destructive' }) {
  if (count <= 0) return null;
  return <Badge variant={tone}>{count}</Badge>;
}

export function TodoPage() {
  const range = usePlannerRange();
  const now = useNow();
  const planner = usePlannerItems(range.start, range.end);
  const missing = useMissingSubmissions();
  const { data: courses } = useCourses();
  const {
    tasks,
    loading: tasksLoading,
    error: tasksError,
    addTask,
    toggleTask,
    deleteTask,
    refetch: refetchTasks,
  } = useTasks();
  const { toggle, pending, touched, error: toggleError } = usePlannerToggle(planner.refetch);
  const { isViewOnly } = useAuth();

  const [showCompleted, setShowCompleted] = useState(false);
  const [touchedTasks, setTouchedTasks] = useState<ReadonlySet<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [courseId, setCourseId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Overdue & missing, upcoming by day
  // ---------------------------------------------------------------------------

  const { overdue, upcomingDays, upcomingCount } = useMemo(() => {
    const missingList = missing.data ?? [];
    const missingAssignmentIds = new Set(missingList.map(a => a.id));
    const missingQuizIds = new Set(missingList.map(a => a.quiz_id).filter((id): id is number => typeof id === 'number'));

    const coveredByMissing = (item: PlannerItem) => {
      const type = normalizePlannableType(item.plannable_type);
      if (type === 'assignment' && missingAssignmentIds.has(item.plannable_id)) return true;
      if (type === 'quiz' && missingQuizIds.has(item.plannable_id)) return true;
      const assignmentId = item.plannable?.assignment_id;
      return typeof assignmentId === 'number' && missingAssignmentIds.has(assignmentId);
    };

    // Personal tasks (planner notes) have their own section below.
    const items = (planner.data ?? []).filter(item => !isPlannerNote(item));

    const overdueEntries: OverdueEntry[] = missingList.map(assignment => ({
      kind: 'missing',
      key: `missing_${assignment.id}`,
      time: assignment.due_at ? new Date(assignment.due_at).getTime() : 0,
      assignment,
    }));
    const overdueKeys = new Set<string>();
    for (const item of items) {
      const date = plannerItemDate(item);
      if (!date || date.getTime() >= now || !canBeOverdue(item) || coveredByMissing(item)) continue;
      const key = plannerItemKey(item);
      if (isPlannerItemDone(item) && !touched.has(key)) continue;
      overdueKeys.add(key);
      overdueEntries.push({ kind: 'planner', key, time: date.getTime(), item });
    }
    // Most recently missed first; entries without a due date at the end.
    overdueEntries.sort((a, b) => (b.time || -Infinity) - (a.time || -Infinity) || 0);

    const days = new Map<string, { date: Date; items: PlannerItem[] }>();
    let count = 0;
    for (const item of items) {
      const date = plannerItemDate(item);
      if (!date || date < range.today) continue;
      const key = plannerItemKey(item);
      if (overdueKeys.has(key)) continue;
      // Missing work is already listed under Overdue (from the missing list).
      if (date.getTime() < now && coveredByMissing(item)) continue;
      if (isPlannerItemDone(item) && !showCompleted && !touched.has(key)) continue;
      const dayKey = format(date, 'yyyy-MM-dd');
      const group = days.get(dayKey) ?? { date, items: [] };
      group.items.push(item);
      days.set(dayKey, group);
      count += 1;
    }
    const sortedDays = [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, group]) => ({
        key,
        date: group.date,
        items: group.items.sort(
          (a, b) => (plannerItemDate(a)?.getTime() ?? 0) - (plannerItemDate(b)?.getTime() ?? 0)
        ),
      }));

    return { overdue: overdueEntries, upcomingDays: sortedDays, upcomingCount: count };
  }, [planner.data, missing.data, now, range.today, showCompleted, touched]);

  // ---------------------------------------------------------------------------
  // Personal tasks
  // ---------------------------------------------------------------------------

  const openTasks = tasks.filter(t => !t.completed || touchedTasks.has(t.id));
  const completedTasks = tasks.filter(t => t.completed && !touchedTasks.has(t.id));
  const openTaskCount = tasks.filter(t => !t.completed).length;

  const handleToggleTask = (id: string) => {
    if (isViewOnly) return;
    setTouchedTasks(prev => new Set(prev).add(id));
    void toggleTask(id);
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || adding || isViewOnly) return;
    setAdding(true);
    setAddError(null);
    try {
      await addTask(trimmed, date || undefined, courseId ? Number(courseId) : undefined);
      setTitle('');
      setDate('');
      setCourseId('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add the task');
    } finally {
      setAdding(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([planner.refetch(), missing.refetch(), refetchTasks()]);
    } finally {
      setRefreshing(false);
    }
  };

  const overdueLoading = planner.loading || missing.loading;
  const overdueCount = overdue.filter(e => e.kind === 'missing' || !isPlannerItemDone(e.item)).length;

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          To-Do
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="show-completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
            <Label htmlFor="show-completed" className="text-sm font-normal">
              Show completed
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <ArrowClockwiseIcon className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {toggleError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {toggleError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Overdue & missing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Overdue &amp; Missing
              </CardTitle>
              <CardDescription>Missing work and unfinished planner items from the last two weeks.</CardDescription>
              <CardAction>
                <CountBadge count={overdueCount} tone="destructive" />
              </CardAction>
            </CardHeader>
            <CardContent>
              {overdueLoading ? (
                <ListSkeleton rows={2} />
              ) : overdue.length === 0 ? (
                planner.error && missing.error ? (
                  <p className="text-sm text-muted-foreground">Couldn&apos;t load overdue work from Canvas.</p>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                    Nothing overdue. Nice work!
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  {overdue.map(entry =>
                    entry.kind === 'missing' ? (
                      <MissingAssignmentRow key={entry.key} assignment={entry.assignment} />
                    ) : (
                      <PlannerItemRow
                        key={entry.key}
                        item={entry.item}
                        pending={pending.has(entry.key)}
                        onToggle={toggle}
                        showDate
                      />
                    )
                  )}
                </div>
              )}
              {!overdueLoading && missing.error && !planner.error && (
                <p className="mt-3 text-xs text-muted-foreground">Missing submissions couldn&apos;t be loaded.</p>
              )}
            </CardContent>
          </Card>

          {/* Upcoming */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Upcoming
              </CardTitle>
              <CardDescription>Everything in your Canvas planner for the next three weeks.</CardDescription>
              <CardAction>
                <CountBadge count={upcomingCount} />
              </CardAction>
            </CardHeader>
            <CardContent>
              {planner.loading ? (
                <ListSkeleton rows={4} />
              ) : planner.error ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Couldn&apos;t load your Canvas planner right now.</p>
                  <Button variant="outline" size="sm" onClick={() => planner.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : upcomingDays.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {showCompleted
                    ? 'Nothing in your planner for the next three weeks.'
                    : "You're all caught up for the next three weeks."}
                </p>
              ) : (
                <div className="space-y-6">
                  {upcomingDays.map(day => (
                    <section key={day.key} aria-label={dayLabel(day.date)}>
                      <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
                        {dayLabel(day.date)}
                        {(isToday(day.date) || isTomorrow(day.date)) && (
                          <span className="text-xs font-normal text-muted-foreground">
                            {format(day.date, 'EEEE, MMM d')}
                          </span>
                        )}
                      </h3>
                      <div className="space-y-2">
                        {day.items.map(item => {
                          const key = plannerItemKey(item);
                          return (
                            <PlannerItemRow key={key} item={item} pending={pending.has(key)} onToggle={toggle} />
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Personal tasks */}
        <div className="min-w-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Personal Tasks
              </CardTitle>
              <CardAction>
                <CountBadge count={openTaskCount} />
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              {isViewOnly ? (
                <ViewOnlyNote>View only: adding tasks is turned off.</ViewOnlyNote>
              ) : (
                <form onSubmit={handleAdd} className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="What do you need to do?"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      aria-label="Task title"
                      className="min-w-0 flex-1"
                      maxLength={255}
                      disabled={adding}
                    />
                    <Button type="submit" disabled={adding || !title.trim()} className="shrink-0">
                      {adding ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
                      Add
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      aria-label="Date (defaults to today)"
                      className="min-w-0"
                      disabled={adding}
                    />
                    <select
                      value={courseId}
                      onChange={e => setCourseId(e.target.value)}
                      aria-label="Course (optional)"
                      className={selectClass}
                      disabled={adding}
                    >
                      <option value="">No course</option>
                      {(courses ?? []).map(course => (
                        <option key={course.id} value={course.id}>
                          {courseTitle(course)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {addError && <p className="text-xs text-destructive">{addError}</p>}
                  <p className="text-xs text-muted-foreground">
                    Tasks are saved as notes in your Canvas planner, so they sync with the Canvas To-Do list and
                    mobile app. Only you can see them. No date means today.
                  </p>
                </form>
              )}

              {tasksLoading ? (
                <ListSkeleton rows={3} />
              ) : tasksError && tasks.length === 0 ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Couldn&apos;t load your personal tasks from Canvas.</p>
                  <Button variant="outline" size="sm" onClick={() => refetchTasks()}>
                    Try again
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {tasksError && <p className="text-xs text-destructive">{tasksError.message}</p>}
                  {openTasks.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {isViewOnly ? 'No open tasks.' : 'No open tasks. Add one above.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {openTasks.map(task => (
                        <PersonalTaskRow
                          key={task.id}
                          task={task}
                          today={range.today}
                          onToggle={handleToggleTask}
                          onDelete={isViewOnly ? undefined : deleteTask}
                        />
                      ))}
                    </div>
                  )}

                  {completedTasks.length > 0 &&
                    (showCompleted ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Completed</p>
                        {completedTasks.map(task => (
                          <PersonalTaskRow
                            key={task.id}
                            task={task}
                            today={range.today}
                            onToggle={handleToggleTask}
                            onDelete={isViewOnly ? undefined : deleteTask}
                          />
                        ))}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowCompleted(true)}
                        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      >
                        {completedTasks.length} completed {completedTasks.length === 1 ? 'task' : 'tasks'} hidden
                      </button>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
