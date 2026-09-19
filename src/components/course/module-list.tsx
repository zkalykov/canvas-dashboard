'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowSquareOutIcon, ArrowsInLineVerticalIcon, CaretDownIcon, CaretUpDownIcon, ChatTextIcon, CheckCircleIcon, CircleIcon, ClipboardTextIcon, FileTextIcon, LinkSimpleIcon, ListChecksIcon, LockSimpleIcon, PaperclipIcon, PuzzlePieceIcon, RecordIcon, StackIcon } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

import { useModules } from '@/hooks/use-canvas';
import { useFilePreview, type PreviewableFile } from '@/components/files/file-preview-dialog';
import type { CourseModule, ModuleItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, ListSkeleton, formatPoints, isFutureDate, safeHttpUrl, stripHtml } from './course-ui';

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

const ITEM_ICONS: Record<ModuleItem['type'], PhosphorIcon> = {
  Assignment: ClipboardTextIcon,
  Quiz: ListChecksIcon,
  Page: FileTextIcon,
  Discussion: ChatTextIcon,
  File: PaperclipIcon,
  ExternalUrl: LinkSimpleIcon,
  ExternalTool: PuzzlePieceIcon,
  SubHeader: FileTextIcon,
};

const ITEM_TYPE_LABELS: Record<ModuleItem['type'], string> = {
  Assignment: 'Assignment',
  Quiz: 'Quiz',
  Page: 'Page',
  Discussion: 'Discussion',
  File: 'File',
  ExternalUrl: 'Link',
  ExternalTool: 'External tool',
  SubHeader: '',
};

type ItemTarget =
  | { kind: 'internal'; href: string }
  | { kind: 'external'; href: string }
  | { kind: 'file'; file: PreviewableFile }
  | { kind: 'none' };

function itemTarget(courseId: number, item: ModuleItem): ItemTarget {
  switch (item.type) {
    case 'Assignment':
      return item.content_id
        ? { kind: 'internal', href: `/courses/${courseId}/assignments/${item.content_id}` }
        : { kind: 'none' };
    case 'Quiz':
      return item.content_id
        ? { kind: 'internal', href: `/courses/${courseId}/quizzes/${item.content_id}` }
        : { kind: 'none' };
    case 'Discussion':
      return item.content_id
        ? { kind: 'internal', href: `/courses/${courseId}/discussions/${item.content_id}` }
        : { kind: 'none' };
    case 'Page':
      return item.page_url
        ? { kind: 'internal', href: `/courses/${courseId}/pages/${encodeURIComponent(item.page_url)}` }
        : { kind: 'none' };
    case 'File':
      return item.content_id ? { kind: 'file', file: { id: item.content_id, display_name: item.title } } : { kind: 'none' };
    case 'ExternalUrl': {
      const href = safeHttpUrl(item.external_url) ?? safeHttpUrl(item.html_url);
      return href ? { kind: 'external', href } : { kind: 'none' };
    }
    case 'ExternalTool': {
      const href = safeHttpUrl(item.html_url);
      return href ? { kind: 'external', href } : { kind: 'none' };
    }
    default:
      return { kind: 'none' };
  }
}

type Requirement = NonNullable<ModuleItem['completion_requirement']>;

function requirementLabel(req: Requirement): string {
  const done = Boolean(req.completed);
  switch (req.type) {
    case 'must_view':
      return done ? 'Viewed' : 'View';
    case 'must_submit':
      return done ? 'Submitted' : 'Submit';
    case 'must_contribute':
      return done ? 'Contributed' : 'Contribute';
    case 'min_score':
      return `${done ? 'Scored' : 'Score'} at least ${formatPoints(req.min_score) ?? '?'}`;
    case 'must_mark_done':
      return done ? 'Marked done' : 'Mark as done';
    default:
      return done ? 'Completed' : 'Complete';
  }
}

function formatDue(date: string): string {
  return format(new Date(date), 'MMM d, h:mm a');
}

// ---------------------------------------------------------------------------
// Module state badge
// ---------------------------------------------------------------------------

const STATE_META: Record<NonNullable<CourseModule['state']>, { label: string; icon: PhosphorIcon; className: string }> = {
  locked: { label: 'Locked', icon: LockSimpleIcon, className: 'border-transparent bg-muted text-muted-foreground' },
  unlocked: { label: 'Not started', icon: CircleIcon, className: 'border-border text-foreground' },
  started: {
    label: 'In progress',
    icon: RecordIcon,
    className: 'border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircleIcon,
    className: 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
};

function ModuleStateBadge({ state }: { state: NonNullable<CourseModule['state']> }) {
  const meta = STATE_META[state];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={meta.className}>
      <Icon />
      {meta.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function ModuleList({ courseId, className }: { courseId: number; className?: string }) {
  const { data, loading, error, refetch } = useModules(courseId);
  const { openPreview, previewDialog } = useFilePreview();
  // Explicit open/closed choices; modules without one use their default.
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});

  const modules = useMemo(
    () =>
      [...(data ?? [])]
        .sort((a, b) => a.position - b.position)
        .map(module => ({ ...module, items: [...(module.items ?? [])].sort((a, b) => a.position - b.position) })),
    [data]
  );
  const namesById = useMemo(() => new Map(modules.map(m => [m.id, m.name])), [modules]);

  if (loading) return <ListSkeleton rows={4} className={className} />;
  if (error) return <ErrorState error={error} subject="this course's modules" onRetry={() => refetch()} className={className} />;
  if (modules.length === 0) {
    return (
      <EmptyState
        icon={StackIcon}
        title="No modules yet"
        description="Your instructor hasn't published any modules for this course."
        className={className}
      />
    );
  }

  const isOpen = (module: CourseModule) => overrides[module.id] ?? defaultOpen(module);
  const allOpen = modules.every(isOpen);
  const setAll = (open: boolean) => setOverrides(Object.fromEntries(modules.map(m => [m.id, open])));

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {modules.length} {modules.length === 1 ? 'module' : 'modules'}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setAll(!allOpen)}>
          {allOpen ? <ArrowsInLineVerticalIcon /> : <CaretUpDownIcon />}
          {allOpen ? 'Collapse all' : 'Expand all'}
        </Button>
      </div>

      {modules.map(module => (
        <ModuleCard
          key={module.id}
          courseId={courseId}
          module={module}
          open={isOpen(module)}
          onToggle={() => setOverrides(prev => ({ ...prev, [module.id]: !isOpen(module) }))}
          prerequisiteNames={module.prerequisite_module_ids
            ?.map(id => namesById.get(id))
            .filter((name): name is string => Boolean(name))}
          onOpenFile={openPreview}
        />
      ))}

      {previewDialog}
    </div>
  );
}

function hasRequirements(module: CourseModule): boolean {
  return (module.items ?? []).some(item => item.completion_requirement);
}

/** Finished modules start collapsed; everything else starts open. */
function defaultOpen(module: CourseModule): boolean {
  return !(module.state === 'completed' && hasRequirements(module));
}

function ModuleCard({
  courseId,
  module,
  open,
  onToggle,
  prerequisiteNames,
  onOpenFile,
}: {
  courseId: number;
  module: CourseModule;
  open: boolean;
  onToggle: () => void;
  prerequisiteNames?: string[];
  onOpenFile: (file: PreviewableFile) => void;
}) {
  const items = module.items ?? [];
  const requirements = items.filter(item => item.completion_requirement);
  const done = requirements.filter(item => item.completion_requirement?.completed).length;
  // Canvas marks modules without requirements "completed" as soon as they unlock; only show that when it means something.
  const showState =
    module.state && (module.state === 'locked' || requirements.length > 0) ? module.state : undefined;
  const unlocksLater = isFutureDate(module.unlock_at);
  const contentId = `module-${module.id}-items`;

  const notes: ReactNode[] = [];
  if (unlocksLater && module.unlock_at) {
    notes.push(
      <span key="unlock" className="inline-flex items-center gap-1">
        <LockSimpleIcon className="h-3 w-3" /> Unlocks {format(new Date(module.unlock_at), "EEE, MMM d 'at' h:mm a")}
      </span>
    );
  }
  if (prerequisiteNames && prerequisiteNames.length > 0 && module.state !== 'completed') {
    notes.push(
      <span key="prereq">
        Complete {prerequisiteNames.map(name => `“${name}”`).join(', ')} first
      </span>
    );
  }
  if (module.require_sequential_progress && module.state !== 'completed') {
    notes.push(<span key="seq">Items must be completed in order</span>);
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-start gap-3 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
      >
        <CaretDownIcon
          className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
        />
        <span className="block min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-words font-semibold">{module.name}</span>
            {showState && <ModuleStateBadge state={showState} />}
          </span>
          {notes.length > 0 && (
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{notes}</span>
          )}
          {requirements.length > 0 && (
            <span className="block text-xs tabular-nums text-muted-foreground sm:hidden">
              {done}/{requirements.length} requirements done
            </span>
          )}
        </span>
        {requirements.length > 0 && (
          <span className="hidden w-28 shrink-0 space-y-1 pt-0.5 sm:block">
            <span className="block text-right text-xs tabular-nums text-muted-foreground">
              {done}/{requirements.length} done
            </span>
            <Progress value={(done / requirements.length) * 100} className="h-1.5" aria-label="Module progress" />
          </span>
        )}
      </button>

      {open && (
        <div id={contentId}>
          {items.length === 0 ? (
            <p className="border-t px-4 py-4 text-sm text-muted-foreground">This module has no items yet.</p>
          ) : (
            <ul className="divide-y border-t">
              {items.map(item => (
                <ModuleItemRow key={item.id} courseId={courseId} item={item} onOpenFile={onOpenFile} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

const ROW_CLASS =
  'flex w-full items-start gap-3 py-3 pr-4 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none';
const INDENT_CLASS = 'pl-[calc(1rem_+_var(--indent)_*_0.75rem)] sm:pl-[calc(1rem_+_var(--indent)_*_1.5rem)]';

function ModuleItemRow({
  courseId,
  item,
  onOpenFile,
}: {
  courseId: number;
  item: ModuleItem;
  onOpenFile: (file: PreviewableFile) => void;
}) {
  const indentStyle = { '--indent': Math.max(0, Math.min(item.indent ?? 0, 5)) } as CSSProperties;

  if (item.type === 'SubHeader') {
    return (
      <li
        style={indentStyle}
        className={cn(
          INDENT_CLASS,
          'bg-muted/20 pt-4 pr-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'
        )}
      >
        {item.title}
      </li>
    );
  }

  const Icon = ITEM_ICONS[item.type] ?? FileTextIcon;
  const target = itemTarget(courseId, item);
  const details = item.content_details;
  const requirement = item.completion_requirement;
  const lockText = details?.locked_for_user ? stripHtml(details.lock_explanation) || 'Locked' : null;
  const points = formatPoints(details?.points_possible);

  const meta = [
    ITEM_TYPE_LABELS[item.type],
    details?.due_at ? `Due ${formatDue(details.due_at)}` : null,
    points !== null && details?.points_possible ? `${points} pts` : null,
  ].filter(Boolean);

  const body = (
    <>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', lockText ? 'text-muted-foreground/60' : 'text-muted-foreground')} />
      <span className="block min-w-0 flex-1 space-y-0.5">
        <span className="flex items-start gap-1.5">
          <span className={cn('break-words font-medium', lockText && 'text-muted-foreground')}>{item.title}</span>
          {target.kind === 'external' && <ArrowSquareOutIcon className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />}
        </span>
        {meta.length > 0 && <span className="block text-xs text-muted-foreground">{meta.join(' · ')}</span>}
        {lockText && (
          <span className="flex items-start gap-1 text-xs text-muted-foreground">
            <LockSimpleIcon className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{lockText}</span>
          </span>
        )}
      </span>
      {requirement && <RequirementPill requirement={requirement} />}
    </>
  );

  const className = cn(ROW_CLASS, INDENT_CLASS);
  let row: ReactNode;
  switch (target.kind) {
    case 'internal':
      row = (
        <Link href={target.href} className={className} style={indentStyle}>
          {body}
        </Link>
      );
      break;
    case 'external':
      row = (
        <a href={target.href} target="_blank" rel="noopener noreferrer" className={className} style={indentStyle}>
          {body}
        </a>
      );
      break;
    case 'file':
      row = (
        <button type="button" onClick={() => onOpenFile(target.file)} className={className} style={indentStyle}>
          {body}
        </button>
      );
      break;
    default:
      row = (
        <div className={cn(className, 'hover:bg-transparent')} style={indentStyle}>
          {body}
        </div>
      );
  }

  return <li>{row}</li>;
}

function RequirementPill({ requirement }: { requirement: Requirement }) {
  const done = Boolean(requirement.completed);
  const label = requirementLabel(requirement);
  return (
    <span
      className={cn(
        'mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        done
          ? 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
          : 'border-border text-muted-foreground'
      )}
      title={done ? `Done: ${label}` : `To do: ${label}`}
    >
      {done ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <CircleIcon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{done ? `Done: ${label}` : `To do: ${label}`}</span>
    </span>
  );
}
