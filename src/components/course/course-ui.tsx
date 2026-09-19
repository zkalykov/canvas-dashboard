'use client';

import type { ReactNode } from 'react';
import { AlarmIcon, ArrowClockwiseIcon, CheckCircleIcon, CircleDashedIcon, ClockIcon, LockSimpleIcon, MagnifyingGlassIcon, SignInIcon, TrayIcon, WarningIcon, XCircleIcon } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

import { CanvasApiError } from '@/lib/canvas-api';
import { assignmentState, type AssignmentState } from '@/lib/submission-status';
import type { Assignment, Course, Enrollment } from '@/lib/types';
import { CanvasHtml } from '@/components/shared/canvas-html';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Canvas HTML typography (Tailwind preflight strips default element styles)
// ---------------------------------------------------------------------------

export const canvasProseClass = cn(
  'text-sm leading-relaxed sm:text-[0.95rem]',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
  '[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold',
  '[&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold',
  '[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold',
  '[&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:font-semibold [&_h5]:mt-4 [&_h5]:font-semibold [&_h6]:mt-4 [&_h6]:font-semibold',
  '[&_p]:my-3 [&_hr]:my-6',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
  '[&_img]:inline-block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md',
  '[&_iframe]:max-w-full [&_video]:max-w-full',
  '[&_table]:my-4 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse',
  '[&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_code]:font-mono [&_code]:text-[0.85em]',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0'
);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Absolute URL on the student's Canvas instance, or null when the host is unknown. */
export function canvasWebUrl(canvasUrl: string | null | undefined, path: string): string | null {
  if (!canvasUrl) return null;
  const base = (/^https?:\/\//i.test(canvasUrl) ? canvasUrl : `https://${canvasUrl}`).replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Only lets http(s) URLs through (never javascript:, data:, ...). */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Plain-text version of a short Canvas HTML snippet (lock explanations, previews). */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isFutureDate(date: string | null | undefined): boolean {
  return Boolean(date) && new Date(date as string).getTime() > Date.now();
}

export function formatPercent(score: number | null | undefined): string | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  return `${Math.round(score * 100) / 100}%`;
}

export function formatPoints(points: number | null | undefined): string | null {
  if (points === null || points === undefined || Number.isNaN(points)) return null;
  return `${Math.round(points * 100) / 100}`;
}

export function studentEnrollment(course: Course | null | undefined): Enrollment | undefined {
  const enrollments = course?.enrollments ?? [];
  return (
    enrollments.find(e => e.type === 'student' || e.type === 'StudentEnrollment') ??
    enrollments.find(e => e.computed_current_score !== null && e.computed_current_score !== undefined)
  );
}

export interface CourseScores {
  current: string | null;
  currentGrade: string | null;
  final: string | null;
  finalGrade: string | null;
  periodTitle: string | null;
  period: string | null;
  periodGrade: string | null;
  hidden: boolean;
}

export function courseScores(course: Course | null | undefined): CourseScores {
  const e = studentEnrollment(course);
  const hasPeriods = Boolean(e?.has_grading_periods);
  return {
    current: formatPercent(e?.computed_current_score),
    currentGrade: e?.computed_current_grade ?? null,
    final: formatPercent(e?.computed_final_score),
    finalGrade: e?.computed_final_grade ?? null,
    periodTitle: hasPeriods ? e?.current_grading_period_title ?? null : null,
    period: hasPeriods ? formatPercent(e?.current_period_computed_current_score) : null,
    periodGrade: hasPeriods ? e?.current_period_computed_current_grade ?? null : null,
    hidden: Boolean(course?.hide_final_grades),
  };
}

// ---------------------------------------------------------------------------
// Assignment status badge
// ---------------------------------------------------------------------------

type DisplayState = AssignmentState | 'past';

const STATUS_META: Record<DisplayState, { label: string; icon: PhosphorIcon; className: string }> = {
  submitted: {
    label: 'Submitted',
    icon: CheckCircleIcon,
    className: 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  missing: {
    label: 'Missing',
    icon: XCircleIcon,
    className: 'border-transparent bg-destructive/15 text-destructive',
  },
  overdue: {
    label: 'Overdue',
    icon: AlarmIcon,
    className: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
  upcoming: { label: 'Upcoming', icon: ClockIcon, className: 'border-border text-foreground' },
  undated: { label: 'No due date', icon: CircleDashedIcon, className: 'border-transparent bg-secondary text-secondary-foreground' },
  past: { label: 'Closed', icon: CircleDashedIcon, className: 'border-transparent bg-secondary text-secondary-foreground' },
};

const NO_ONLINE_SUBMISSION = new Set(['none', 'on_paper', 'not_graded']);

/**
 * assignmentState, except that work with no online submission (on paper,
 * "no submission") is never shown as overdue just because its date passed.
 */
export function displayState(assignment: Assignment): DisplayState {
  const state = assignmentState(assignment);
  const offline =
    assignment.submission_types?.length > 0 && assignment.submission_types.every(t => NO_ONLINE_SUBMISSION.has(t));
  if (offline && state === 'overdue') return 'past';
  return state;
}

export function AssignmentStatusBadge({ assignment, className }: { assignment: Assignment; className?: string }) {
  const meta = STATUS_META[displayState(assignment)];
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  );
}

/** "18 / 20" (or "Excused", or the letter grade) when the submission has been graded. */
export function gradedScore(assignment: Assignment): string | null {
  const submission = assignment.submission;
  if (!submission) return null;
  if (submission.excused) return 'Excused';
  if (submission.workflow_state !== 'graded') return null;
  const score = formatPoints(submission.score);
  if (score !== null) {
    const possible = formatPoints(assignment.points_possible);
    return possible !== null ? `${score} / ${possible}` : score;
  }
  return submission.grade ?? null;
}

// ---------------------------------------------------------------------------
// Loading, empty and error states
// ---------------------------------------------------------------------------

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon = TrayIcon,
  title,
  description,
  action,
  className,
}: {
  icon?: PhosphorIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          {description && <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

export type ErrorKind = 'session' | 'forbidden' | 'notFound' | 'generic';

export function classifyError(error: unknown): ErrorKind {
  if (error instanceof CanvasApiError) {
    if (error.status === 404) return 'notFound';
    if (error.status === 403) return 'forbidden';
    if (error.status === 401) {
      // Canvas answers 401 both for a bad token and for "user not authorized to perform that action".
      const text = `${error.message} ${error.details ?? ''}`.toLowerCase();
      return text.includes('not authorized') || text.includes('unauthorized') ? 'forbidden' : 'session';
    }
  }
  return 'generic';
}

/** Friendly message for a failed Canvas request. `subject` is e.g. "course", "page", "modules". */
export function ErrorState({
  error,
  subject,
  onRetry,
  className,
}: {
  error: unknown;
  subject: string;
  onRetry?: () => void;
  className?: string;
}) {
  const kind = classifyError(error);
  const copy: Record<ErrorKind, { icon: PhosphorIcon; title: string; description: string }> = {
    session: {
      icon: SignInIcon,
      title: 'Your session has expired',
      description: 'Sign in again to keep using the dashboard.',
    },
    forbidden: {
      icon: LockSimpleIcon,
      title: `You don't have access to ${subject}`,
      description: "It may not be published yet, or your instructor hasn't made it available to students.",
    },
    notFound: {
      icon: MagnifyingGlassIcon,
      title: `We couldn't find ${subject}`,
      description: 'It may have been deleted, renamed or unpublished.',
    },
    generic: {
      icon: WarningIcon,
      title: `Couldn't load ${subject}`,
      description: 'Canvas did not respond as expected. Please try again in a moment.',
    },
  };
  const { icon, title, description } = copy[kind];

  let action: ReactNode = null;
  if (kind === 'session') {
    action = (
      <Button size="sm" onClick={() => window.location.assign('/')}>
        <SignInIcon /> Sign in again
      </Button>
    );
  } else if (kind === 'generic' && onRetry) {
    action = (
      <Button size="sm" variant="outline" onClick={onRetry}>
        <ArrowClockwiseIcon /> Try again
      </Button>
    );
  }

  return <EmptyState icon={icon} title={title} description={description} action={action} className={className} />;
}

/** Amber notice for content Canvas has locked; `html` is Canvas's lock_explanation. */
export function LockedNotice({ html }: { html: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
      <LockSimpleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">This content is locked</p>
        {html ? (
          <CanvasHtml html={html} className="text-muted-foreground [&_a]:text-primary [&_a]:underline" />
        ) : (
          <p className="text-muted-foreground">Your instructor hasn&apos;t made it available yet.</p>
        )}
      </div>
    </div>
  );
}
