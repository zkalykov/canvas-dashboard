'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { ChatTextIcon, ClipboardTextIcon, ListChecksIcon, PuzzlePieceIcon } from '@phosphor-icons/react';
import { useAssignments } from '@/hooks/use-canvas';
import type { Assignment } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AssignmentStatusBadge,
  EmptyState,
  ErrorState,
  ListSkeleton,
  formatPoints,
  gradedScore,
} from './course-ui';

export interface AssignmentGroups {
  upcoming: Assignment[];
  undated: Assignment[];
  past: Assignment[];
}

export function groupAssignments(assignments: Assignment[]): AssignmentGroups {
  const now = Date.now();
  const time = (a: Assignment) => new Date(a.due_at as string).getTime();
  const upcoming = assignments.filter(a => a.due_at && time(a) >= now).sort((a, b) => time(a) - time(b));
  const past = assignments.filter(a => a.due_at && time(a) < now).sort((a, b) => time(b) - time(a));
  const undated = assignments.filter(a => !a.due_at).sort((a, b) => a.name.localeCompare(b.name));
  return { upcoming, undated, past };
}

/** Icon for the kind of work: quiz, discussion, external tool or regular assignment. */
export function AssignmentTypeIcon({ assignment, className }: { assignment: Assignment; className?: string }) {
  const types = assignment.submission_types ?? [];
  if (assignment.is_quiz_assignment || assignment.quiz_id || types.includes('online_quiz')) {
    return <ListChecksIcon className={className} aria-hidden="true" />;
  }
  if (types.includes('discussion_topic')) return <ChatTextIcon className={className} aria-hidden="true" />;
  if (types.includes('external_tool')) return <PuzzlePieceIcon className={className} aria-hidden="true" />;
  return <ClipboardTextIcon className={className} aria-hidden="true" />;
}

function dueLabel(assignment: Assignment, showRelative: boolean): string | null {
  if (!assignment.due_at) return null;
  const due = new Date(assignment.due_at);
  const absolute = format(due, 'EEE, MMM d · h:mm a');
  return showRelative ? `${absolute} (${formatDistanceToNow(due, { addSuffix: true })})` : absolute;
}

export function CourseAssignments({ courseId }: { courseId: number }) {
  const { data, loading, error, refetch } = useAssignments(courseId);
  const groups = useMemo(() => groupAssignments(data ?? []), [data]);

  if (loading) return <ListSkeleton rows={6} />;
  if (error) return <ErrorState error={error} subject="this course's assignments" onRetry={() => refetch()} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={ClipboardTextIcon}
        title="No assignments yet"
        description="Assignments will show up here once your instructor publishes them."
      />
    );
  }

  return (
    <div className="space-y-6">
      <AssignmentSection title="Upcoming" assignments={groups.upcoming} courseId={courseId} relative />
      <AssignmentSection title="No due date" assignments={groups.undated} courseId={courseId} />
      <AssignmentSection title="Past" assignments={groups.past} courseId={courseId} />
    </div>
  );
}

function AssignmentSection({
  title,
  assignments,
  courseId,
  relative = false,
}: {
  title: string;
  assignments: Assignment[];
  courseId: number;
  relative?: boolean;
}) {
  if (assignments.length === 0) return null;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b bg-muted/40 px-4 py-3 [.border-b]:pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {title}
          <Badge variant="secondary" className="tabular-nums">
            {assignments.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <ul className="divide-y">
        {assignments.map(assignment => (
          <li key={assignment.id}>
            <AssignmentRow assignment={assignment} courseId={courseId} relative={relative} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AssignmentRow({
  assignment,
  courseId,
  relative,
}: {
  assignment: Assignment;
  courseId: number;
  relative: boolean;
}) {
  const due = dueLabel(assignment, relative);
  const score = gradedScore(assignment);
  const points = formatPoints(assignment.points_possible);

  return (
    <Link
      href={`/courses/${courseId}/assignments/${assignment.id}`}
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
    >
      <AssignmentTypeIcon assignment={assignment} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="break-words font-medium">{assignment.name}</p>
        <p className="text-xs text-muted-foreground">
          {[due ? `Due ${due}` : null, points && assignment.points_possible ? `${points} pts` : null]
            .filter(Boolean)
            .join(' · ') || 'No due date'}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
        {score && (
          <span className="text-sm font-semibold tabular-nums" title="Your score">
            {score}
          </span>
        )}
        <AssignmentStatusBadge assignment={assignment} />
      </div>
    </Link>
  );
}
