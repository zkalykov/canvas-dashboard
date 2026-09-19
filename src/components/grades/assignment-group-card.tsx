'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { assignmentState, isSubmitted } from '@/lib/submission-status';
import type { Assignment, AssignmentGroup } from '@/lib/types';
import { formatPercent, formatPoints, type GroupGrade } from './grade-math';

type Tone = 'normal' | 'bad' | 'warn' | 'muted';

/** One short status line per assignment, colored only when it needs attention. */
function assignmentStatus(assignment: Assignment): { label: string; tone: Tone } {
  const submission = assignment.submission;
  const due = assignment.due_at ? ` · due ${format(new Date(assignment.due_at), 'MMM d')}` : '';
  if (assignment.omit_from_final_grade) return { label: "Doesn't count toward the grade", tone: 'muted' };
  if (submission?.excused) return { label: 'Excused', tone: 'muted' };
  if (submission?.score !== null && submission?.score !== undefined) {
    if (submission.missing) return { label: 'Missing', tone: 'bad' };
    return submission.late ? { label: 'Graded · late', tone: 'warn' } : { label: 'Graded', tone: 'muted' };
  }
  if (isSubmitted(submission)) return { label: 'Submitted · waiting for a grade', tone: 'normal' };
  const state = assignmentState(assignment);
  if (state === 'missing') return { label: 'Missing', tone: 'bad' };
  if (state === 'overdue') return { label: `Not submitted${due}`, tone: 'warn' };
  if (state === 'upcoming') return { label: `Not submitted yet${due}`, tone: 'muted' };
  return { label: 'Not graded', tone: 'muted' };
}

function dropRuleText(group: AssignmentGroup): string | null {
  const lowest = group.rules?.drop_lowest ?? 0;
  const highest = group.rules?.drop_highest ?? 0;
  const parts: string[] = [];
  if (lowest > 0) parts.push(`lowest ${lowest === 1 ? 'score' : `${lowest}`}`);
  if (highest > 0) parts.push(`highest ${highest === 1 ? 'score' : `${highest}`}`);
  return parts.length ? `Drops ${parts.join(' and ')}` : null;
}

interface AssignmentGroupCardProps {
  courseId: number;
  group: AssignmentGroup;
  weighted: boolean;
  result: GroupGrade | undefined;
  baseline: GroupGrade | undefined;
  whatIfMode: boolean;
  overrides: Record<number, string>;
  onOverrideChange: (assignmentId: number, value: string) => void;
}

/** An assignment group: a small header line, then its assignments in a grey list. */
export function AssignmentGroupCard({
  courseId,
  group,
  weighted,
  result,
  baseline,
  whatIfMode,
  overrides,
  onOverrideChange,
}: AssignmentGroupCardProps) {
  const assignments = group.assignments ?? [];
  const dropped = new Set(result?.droppedIds ?? []);
  const percent = result?.percent ?? null;
  const delta =
    whatIfMode && percent !== null && baseline?.percent !== null && baseline?.percent !== undefined ? percent - baseline.percent : null;
  const hasPoints = (result?.possible ?? 0) > 0;
  const details = [
    weighted ? `${formatPoints(group.group_weight)}% of grade` : null,
    hasPoints ? `${formatPoints(result?.earned)} / ${formatPoints(result?.possible)} pts` : 'Nothing graded yet',
    dropRuleText(group),
  ].filter(Boolean);

  return (
    <section>
      <div className="flex items-end justify-between gap-4 px-1 pb-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium">{group.name}</h3>
          <p className="text-[13px] text-muted-foreground">{details.join(' · ')}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-medium tabular-nums">{formatPercent(percent, '–')}</p>
          {delta !== null && Math.abs(delta) >= 0.005 && (
            <p className={cn('text-[12px] tabular-nums', delta > 0 ? 'text-success' : 'text-destructive')}>
              {delta > 0 ? '+' : ''}
              {formatPoints(delta)}%
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-muted/70 p-1.5">
        {assignments.length === 0 ? (
          <p className="px-3 py-2.5 text-[14px] text-muted-foreground">No assignments in this group yet.</p>
        ) : (
          assignments.map(assignment => (
            <AssignmentRow
              key={assignment.id}
              courseId={courseId}
              assignment={assignment}
              dropped={dropped.has(assignment.id)}
              whatIfMode={whatIfMode}
              override={overrides[assignment.id]}
              onOverrideChange={onOverrideChange}
            />
          ))
        )}
      </div>
    </section>
  );
}

function AssignmentRow({
  courseId,
  assignment,
  dropped,
  whatIfMode,
  override,
  onOverrideChange,
}: {
  courseId: number;
  assignment: Assignment;
  dropped: boolean;
  whatIfMode: boolean;
  override: string | undefined;
  onOverrideChange: (assignmentId: number, value: string) => void;
}) {
  const submission = assignment.submission;
  const possible = assignment.points_possible ?? 0;
  const actualScore = submission?.excused ? null : (submission?.score ?? null);
  const overrideValue = override !== undefined && override.trim() !== '' ? Number(override) : null;
  const validOverride = overrideValue !== null && Number.isFinite(overrideValue) && overrideValue >= 0;
  const changed = whatIfMode && validOverride && overrideValue !== actualScore;
  const status = assignmentStatus(assignment);

  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5', changed ? 'bg-background' : 'hover:bg-background/60')}>
      <div className="min-w-0 flex-1">
        <Link href={`/courses/${courseId}/assignments/${assignment.id}`} className="block truncate text-[14px] hover:underline">
          {assignment.name}
        </Link>
        <p
          className={cn(
            'truncate text-[12px]',
            status.tone === 'bad' && 'text-destructive',
            status.tone === 'warn' && 'text-amber-600 dark:text-amber-400',
            status.tone !== 'bad' && status.tone !== 'warn' && 'text-muted-foreground'
          )}
        >
          {dropped ? 'Dropped · ' : ''}
          {changed ? 'What-if · ' : ''}
          {status.label}
        </p>
      </div>

      {whatIfMode ? (
        <label className="flex shrink-0 items-center gap-1.5 text-[14px]">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={override ?? ''}
            placeholder={actualScore !== null ? formatPoints(actualScore) : '–'}
            onChange={event => onOverrideChange(assignment.id, event.target.value)}
            disabled={Boolean(assignment.omit_from_final_grade)}
            aria-label={`What-if score for ${assignment.name}`}
            className="h-8 w-16 bg-background text-right tabular-nums"
          />
          <span className="text-muted-foreground tabular-nums">/ {formatPoints(possible)}</span>
        </label>
      ) : (
        <p className={cn('shrink-0 text-[14px] tabular-nums', dropped && 'text-muted-foreground line-through')}>
          {submission?.excused ? 'Excused' : actualScore === null ? '–' : formatPoints(actualScore)}
          {!submission?.excused && <span className="text-muted-foreground"> / {formatPoints(possible)}</span>}
        </p>
      )}
    </div>
  );
}
