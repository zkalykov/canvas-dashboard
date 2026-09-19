'use client';

import Link from 'next/link';
import { isBefore, startOfDay } from 'date-fns';
import { ArrowSquareOutIcon, ClockIcon, NoteIcon, TrashIcon } from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth-context';
import { useCourseColors } from '@/hooks/use-canvas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { PersonalTask, PlannerItem } from '@/lib/types';
import {
  STATUS_TONE_CLASS,
  isPlannerItemDone,
  plannerItemLink,
  plannerStatusBadges,
  plannerTimeLabel,
  plannerTypeMeta,
  shortDayLabel,
  useCourseLabel,
  type StatusTone,
} from './planner-utils';

export function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <Badge variant="outline" className={cn('px-1.5 py-0 text-[11px] font-medium', STATUS_TONE_CLASS[tone])}>
      {label}
    </Badge>
  );
}

function CourseTag({ courseId, label }: { courseId?: number | null; label: string }) {
  const { getColor } = useCourseColors();
  if (!label) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40"
        style={courseId ? { backgroundColor: getColor(courseId) } : undefined}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** One Canvas planner item: done checkbox, type icon, linked title, course, time and status badges. */
export function PlannerItemRow({
  item,
  pending,
  onToggle,
  showDate = false,
  compact = false,
}: {
  item: PlannerItem;
  pending?: boolean;
  onToggle: (item: PlannerItem, complete: boolean) => void;
  showDate?: boolean;
  compact?: boolean;
}) {
  const { canvasUrl, isViewOnly } = useAuth();
  const courseLabel = useCourseLabel();
  const done = isPlannerItemDone(item);
  const { icon: TypeIcon, label: typeLabel } = plannerTypeMeta(item.plannable_type);
  const link = plannerItemLink(item, canvasUrl);
  const title = item.plannable?.title || 'Untitled';
  const time = plannerTimeLabel(item, showDate);
  const badges = plannerStatusBadges(item);
  const course = courseLabel(item.course_id, item.context_name);

  const titleClass = cn(
    'block truncate text-sm font-medium',
    done && 'text-muted-foreground line-through',
    link && 'hover:underline underline-offset-2'
  );

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border transition-colors',
        compact ? 'p-2' : 'p-3',
        done ? 'bg-muted/40' : 'hover:bg-muted/40'
      )}
    >
      <Checkbox
        checked={done}
        disabled={pending || isViewOnly}
        onCheckedChange={value => onToggle(item, value === true)}
        aria-label={done ? `Mark "${title}" as not done` : `Mark "${title}" as done`}
        className="mt-0.5"
      />
      <TypeIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label={typeLabel} />
      <div className="min-w-0 flex-1">
        {link ? (
          link.external ? (
            <a href={link.href} target="_blank" rel="noopener noreferrer" className={cn(titleClass, 'inline-flex max-w-full items-center gap-1')}>
              <span className="truncate">{title}</span>
              <ArrowSquareOutIcon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
            </a>
          ) : (
            <Link href={link.href} className={titleClass}>
              {title}
            </Link>
          )
        ) : (
          <span className={titleClass}>{title}</span>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <CourseTag courseId={item.course_id} label={course} />
          {time && (
            <span className="flex shrink-0 items-center gap-1">
              <ClockIcon className="h-3 w-3" aria-hidden />
              {time}
            </span>
          )}
          {badges.length > 0 && (
            <span className="flex flex-wrap items-center gap-1">
              {badges.map(badge => (
                <StatusBadge key={badge.label} {...badge} />
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** A personal task (Canvas planner note). */
export function PersonalTaskRow({
  task,
  today,
  onToggle,
  onDelete,
  compact = false,
}: {
  task: PersonalTask;
  today: Date;
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  compact?: boolean;
}) {
  const courseLabel = useCourseLabel();
  const { isViewOnly } = useAuth();
  const saving = !/^\d+$/.test(task.id); // optimistic row, not in Canvas yet
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const overdue = !task.completed && due !== null && isBefore(startOfDay(due), today);
  const course = task.courseId ? courseLabel(task.courseId) : '';

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border transition-colors',
        compact ? 'p-2' : 'p-3',
        task.completed ? 'bg-muted/40' : 'hover:bg-muted/40',
        saving && 'opacity-60'
      )}
    >
      <Checkbox
        checked={task.completed}
        disabled={saving || isViewOnly}
        onCheckedChange={() => onToggle(task.id)}
        aria-label={task.completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        className="mt-0.5"
      />
      <NoteIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Personal task" />
      <div className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-medium', task.completed && 'text-muted-foreground line-through')}>
          {task.title}
        </span>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {course && <CourseTag courseId={task.courseId} label={course} />}
          {due && (
            <span className={cn('flex shrink-0 items-center gap-1', overdue && 'font-medium text-destructive')}>
              <ClockIcon className="h-3 w-3" aria-hidden />
              {shortDayLabel(due)}
            </span>
          )}
          {overdue && <StatusBadge label="Overdue" tone="danger" />}
          {saving && <span>Saving…</span>}
        </div>
      </div>
      {onDelete && !isViewOnly && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="-my-1 shrink-0 text-muted-foreground hover:text-destructive"
          disabled={saving}
          onClick={() => onDelete(task.id)}
          aria-label={`Delete "${task.title}"`}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
