'use client';

import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { useCourseColors } from '@/hooks/use-canvas';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/todo/todo-rows';
import { useCourseLabel } from '@/components/todo/planner-utils';
import type { Assignment, Course } from '@/lib/types';

export type MissingAssignment = Assignment & { course?: Course };

/** Most recently missed first; undated last. */
export function MissingAssignmentRow({ assignment, compact = false }: { assignment: MissingAssignment; compact?: boolean }) {
  const { getColor } = useCourseColors();
  const courseLabel = useCourseLabel();
  const course =
    assignment.course?.course_code || assignment.course?.name || courseLabel(assignment.course_id) || 'Course';
  const due = assignment.due_at ? new Date(assignment.due_at) : null;

  return (
    <Link
      href={`/courses/${assignment.course_id}/assignments/${assignment.id}`}
      className={cn(
        'flex items-start gap-3 rounded-lg border transition-colors hover:bg-muted',
        compact ? 'p-2' : 'p-3'
      )}
    >
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: getColor(assignment.course_id) }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{assignment.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {course}
          {due && (
            <>
              {' · Due '}
              <time dateTime={assignment.due_at!} title={format(due, 'PPpp')}>
                {format(due, 'MMM d')} ({formatDistanceToNow(due, { addSuffix: true })})
              </time>
            </>
          )}
        </p>
      </div>
      <StatusBadge label="Missing" tone="danger" />
    </Link>
  );
}
