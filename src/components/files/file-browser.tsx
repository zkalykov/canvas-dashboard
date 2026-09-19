'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowClockwiseIcon, ArrowDownIcon, ArrowUpIcon, ArrowsDownUpIcon, CaretRightIcon, DownloadSimpleIcon, FolderDashedIcon, FolderOpenIcon, FolderSimpleIcon, FolderSimpleLockIcon, HouseIcon, LockSimpleIcon, MagnifyingGlassIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import canvasApi, { CanvasApiError } from '@/lib/canvas-api';
import { useCanvasData, useFileSearch, useFolderContents, useRootFolder } from '@/hooks/use-canvas';
import { fileContentUrl, formatFileSize } from '@/lib/files';
import type { CanvasFile, CanvasFolder } from '@/lib/types';
import { useFilePreview } from '@/components/files/file-preview-dialog';
import { FileIcon } from '@/components/files/file-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type SortKey = 'name' | 'date' | 'size';
type SortDir = 'asc' | 'desc';
interface SortState {
  key: SortKey;
  dir: SortDir;
}

const DEFAULT_DIR: Record<SortKey, SortDir> = { name: 'asc', date: 'desc', size: 'desc' };

const SORT_LABELS: Record<SortKey, { label: string; asc: string; desc: string }> = {
  name: { label: 'Name', asc: 'A to Z', desc: 'Z to A' },
  date: { label: 'Updated', asc: 'Oldest first', desc: 'Newest first' },
  size: { label: 'Size', asc: 'Smallest first', desc: 'Largest first' },
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function isSortKey(value: string): value is SortKey {
  return value === 'name' || value === 'date' || value === 'size';
}

function timestamp(value: string | null | undefined): number {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? 0 : time;
}

function fileName(file: CanvasFile): string {
  return file.display_name || file.filename || 'Untitled file';
}

function sortFiles(files: CanvasFile[], sort: SortState): CanvasFile[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...files].sort((a, b) => {
    let diff: number;
    if (sort.key === 'date') diff = timestamp(a.updated_at) - timestamp(b.updated_at);
    else if (sort.key === 'size') diff = (a.size ?? 0) - (b.size ?? 0);
    else diff = collator.compare(fileName(a), fileName(b));
    return diff !== 0 ? diff * sign : collator.compare(fileName(a), fileName(b));
  });
}

function sortFolders(folders: CanvasFolder[], sort: SortState): CanvasFolder[] {
  // Folders have no size, so sorting by size keeps them alphabetical.
  const sign = sort.key !== 'size' && sort.dir === 'desc' ? -1 : 1;
  return [...folders].sort((a, b) => {
    const diff =
      sort.key === 'date' ? timestamp(a.updated_at) - timestamp(b.updated_at) : collator.compare(a.name, b.name);
    return diff !== 0 ? diff * sign : collator.compare(a.name, b.name);
  });
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format(date, 'MMM d, yyyy');
}

/** Canvas lock explanations can contain HTML (module links); show them as plain text. */
function plainText(html: string | null | undefined): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Search the student's personal files (use-canvas only has a course search). */
function useUserFileSearch(searchTerm: string) {
  const term = searchTerm.trim();
  return useCanvasData<CanvasFile[]>(term.length >= 2 ? `canvas_user_file_search_${term}` : null, () => {
    const params = new URLSearchParams({ search_term: term, per_page: '100', sort: 'name' });
    return canvasApi.requestAll<CanvasFile>(`/users/self/files?${params}`, { maxPages: 5 });
  });
}

function isAccessError(error: Error | undefined): boolean {
  return error instanceof CanvasApiError && [401, 403, 404].includes(error.status);
}

/** The proxy answers 401 without `details` when there is no session; Canvas's own 401s always carry a body. */
function isSessionError(error: Error | undefined): boolean {
  return error instanceof CanvasApiError && error.status === 401 && error.details === undefined;
}

// ---------------------------------------------------------------------------
// FileBrowser
// ---------------------------------------------------------------------------

/**
 * Browse, search, preview and download Canvas files.
 * `context` is a course id, or 'user' for the student's personal files.
 */
export function FileBrowser({ context, className }: { context: number | 'user'; className?: string }) {
  // Keyed so switching course starts again at the root folder with an empty search.
  return <FileBrowserView key={String(context)} context={context} className={className} />;
}

function FileBrowserView({ context, className }: { context: number | 'user'; className?: string }) {
  const root = useRootFolder(context);
  const [trail, setTrail] = useState<CanvasFolder[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const { openPreview, previewDialog } = useFilePreview();

  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, 300);
  const searchTerm = trimmed.length >= 2 ? debounced : '';
  const isSearching = searchTerm.length >= 2;

  const current = trail.length > 0 ? trail[trail.length - 1] : root.data;
  const contents = useFolderContents(current?.id);
  const courseSearch = useFileSearch(context === 'user' ? null : context, searchTerm);
  const userSearch = useUserFileSearch(context === 'user' ? searchTerm : '');
  const search = context === 'user' ? userSearch : courseSearch;

  const folders = useMemo(
    () => sortFolders((contents.data?.folders ?? []).filter(folder => !folder.hidden_for_user), sort),
    [contents.data, sort]
  );
  const files = useMemo(() => sortFiles(contents.data?.files ?? [], sort), [contents.data, sort]);
  const results = useMemo(() => sortFiles(search.data ?? [], sort), [search.data, sort]);

  const rootLabel = context === 'user' ? 'My files' : 'Course files';

  const toggleSort = (key: SortKey) =>
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: DEFAULT_DIR[key] }));

  if (!root.data) {
    return (
      <div className={cn('@container space-y-3', className)}>
        {root.error ? (
          <div className="rounded-lg border bg-card">
            <RootError error={root.error} context={context} onRetry={() => void root.refetch()} />
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 w-24" />
            </div>
            <Skeleton className="h-5 w-40" />
            <div className="rounded-lg border bg-card">
              <ListSkeleton />
            </div>
          </>
        )}
      </div>
    );
  }

  let body: ReactNode;
  if (isSearching) {
    if (search.error && !search.data) {
      body = (
        <StateMessage
          icon={WarningCircleIcon}
          title="Search failed"
          description={
            isAccessError(search.error)
              ? "Canvas didn't allow searching these files."
              : 'Something went wrong while searching. Try again in a moment.'
          }
          action={<RetryButton onClick={() => void search.refetch()} />}
        />
      );
    } else if (!search.data) {
      body = <ListSkeleton rows={4} />;
    } else if (results.length === 0) {
      body = (
        <StateMessage
          icon={MagnifyingGlassIcon}
          title="No matching files"
          description={`Nothing named like "${searchTerm}" was found. Try a different word.`}
        />
      );
    } else {
      body = (
        <ul className="divide-y">
          {results.map(file => (
            <FileRow key={file.id} file={file} onOpen={openPreview} />
          ))}
        </ul>
      );
    }
  } else if (contents.error && !contents.data) {
    body = isAccessError(contents.error) ? (
      <StateMessage
        icon={FolderSimpleLockIcon}
        title="You can't open this folder"
        description="It may be locked or hidden by your instructor."
        action={
          trail.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setTrail(prev => prev.slice(0, -1))}>
              Go back
            </Button>
          ) : undefined
        }
      />
    ) : (
      <StateMessage
        icon={WarningCircleIcon}
        title="Couldn't load this folder"
        description="Something went wrong talking to Canvas. Try again in a moment."
        action={<RetryButton onClick={() => void contents.refetch()} />}
      />
    );
  } else if (!contents.data) {
    body = <ListSkeleton />;
  } else if (folders.length === 0 && files.length === 0) {
    body = (
      <StateMessage
        icon={FolderOpenIcon}
        title="This folder is empty"
        description={
          trail.length === 0 && context !== 'user'
            ? 'No files have been shared here yet. Course materials may also be posted in Modules.'
            : undefined
        }
      />
    );
  } else {
    body = (
      <ul className="divide-y">
        {folders.map(folder => (
          <FolderRow key={`folder-${folder.id}`} folder={folder} onOpen={f => setTrail(prev => [...prev, f])} />
        ))}
        {files.map(file => (
          <FileRow key={`file-${file.id}`} file={file} onOpen={openPreview} />
        ))}
      </ul>
    );
  }

  return (
    <div className={cn('@container space-y-3', className)}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            enterKeyHint="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') setQuery('');
            }}
            placeholder={context === 'user' ? 'Search my files' : 'Search course files'}
            aria-label="Search files"
            className="pr-8 pl-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        <SortMenu sort={sort} onChange={setSort} />
      </div>

      {isSearching ? (
        <div className="flex min-h-8 items-center justify-between gap-2 text-sm">
          <p className="min-w-0 truncate text-muted-foreground">
            {search.loading && !search.data
              ? 'Searching…'
              : `${plural(results.length, 'result')} for "${searchTerm}"`}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setQuery('')}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Breadcrumbs rootLabel={rootLabel} trail={trail} onNavigate={depth => setTrail(prev => prev.slice(0, depth))} />
          {trimmed.length === 1 && (
            <p className="text-xs text-muted-foreground">Type at least 2 characters to search</p>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <ListHeader sort={sort} onSort={toggleSort} />
        {body}
      </div>

      {previewDialog}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar pieces
// ---------------------------------------------------------------------------

function Breadcrumbs({
  rootLabel,
  trail,
  onNavigate,
}: {
  rootLabel: string;
  trail: CanvasFolder[];
  onNavigate: (depth: number) => void;
}) {
  const crumbs = [{ key: 'root', label: rootLabel }, ...trail.map(folder => ({ key: String(folder.id), label: folder.name }))];
  return (
    <nav aria-label="Folder path" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-sm">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const content = (
            <>
              {index === 0 && <HouseIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span className="truncate">{crumb.label}</span>
            </>
          );
          return (
            <li key={crumb.key} className="flex min-w-0 items-center gap-1">
              {index > 0 && <CaretRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
              {isLast ? (
                <span aria-current="page" className="inline-flex max-w-64 min-w-0 items-center gap-1.5 px-1 font-medium">
                  {content}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate(index)}
                  className="inline-flex max-w-48 min-w-0 items-center gap-1.5 rounded px-1 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SortMenu({ sort, onChange }: { sort: SortState; onChange: (sort: SortState) => void }) {
  const labels = SORT_LABELS[sort.key];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="shrink-0" aria-label={`Sort files: ${labels.label}, ${labels[sort.dir]}`}>
          <ArrowsDownUpIcon />
          <span className="hidden @sm:inline">{labels.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort.key}
          onValueChange={value => isSortKey(value) && onChange({ key: value, dir: DEFAULT_DIR[value] })}
        >
          <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="date">Last updated</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="size">Size</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={sort.dir}
          onValueChange={value => (value === 'asc' || value === 'desc') && onChange({ ...sort, dir: value })}
        >
          <DropdownMenuRadioItem value="asc">{labels.asc}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="desc">{labels.desc}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

// Column widths shared by the header and every row so they line up.
const SIZE_COL = 'hidden w-20 shrink-0 text-right @md:block';
const DATE_COL = 'hidden w-28 shrink-0 text-right @xl:block';
const ACTION_COL = 'flex w-8 shrink-0 justify-center';

function ListHeader({ sort, onSort }: { sort: SortState; onSort: (key: SortKey) => void }) {
  const column = (key: SortKey, label: string, className: string) => {
    const active = sort.key === key;
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        className={cn(
          'items-center gap-1 transition-colors hover:text-foreground',
          active && 'text-foreground',
          className
        )}
      >
        {label}
        {active && (sort.dir === 'asc' ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />)}
      </button>
    );
  };
  return (
    <div className="hidden items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground @md:flex">
      <div className="min-w-0 flex-1">{column('name', 'Name', 'inline-flex')}</div>
      {column('size', 'Size', cn(SIZE_COL, '@md:inline-flex justify-end'))}
      {column('date', 'Updated', cn(DATE_COL, '@xl:inline-flex justify-end'))}
      <span className={ACTION_COL} aria-hidden="true" />
    </div>
  );
}

function FolderRow({ folder, onOpen }: { folder: CanvasFolder; onOpen: (folder: CanvasFolder) => void }) {
  const locked = folder.locked_for_user;
  const folderCount = folder.folders_count ?? 0;
  const fileCount = folder.files_count ?? 0;
  const summary = locked
    ? 'Locked'
    : folderCount + fileCount === 0
      ? 'Empty'
      : [folderCount > 0 && plural(folderCount, 'folder'), fileCount > 0 && plural(fileCount, 'file')]
          .filter(Boolean)
          .join(' · ');
  const date = formatDate(folder.updated_at);

  const inner = (
    <>
      {locked ? (
        <FolderSimpleLockIcon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <FolderSimpleIcon className="h-5 w-5 shrink-0 fill-sky-500/20 text-sky-600 dark:text-sky-400" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{folder.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {summary}
          {date && <span className="@xl:hidden"> · {date}</span>}
        </p>
      </div>
      <span className={cn(SIZE_COL, 'text-sm text-muted-foreground')} />
      <span className={cn(DATE_COL, 'text-sm text-muted-foreground')}>{date}</span>
      <span className={ACTION_COL}>
        {!locked && <CaretRightIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      </span>
    </>
  );

  const rowClass = 'flex w-full items-center gap-3 px-3 py-2.5 text-left @md:px-4';
  return (
    <li>
      {locked ? (
        <div className={cn(rowClass, 'text-muted-foreground')} title="This folder is locked">
          {inner}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(folder)}
          className={cn(
            rowClass,
            'transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset'
          )}
        >
          {inner}
        </button>
      )}
    </li>
  );
}

function FileRow({ file, onOpen }: { file: CanvasFile; onOpen: (file: CanvasFile) => void }) {
  const name = fileName(file);
  // Locked files come back without a download URL, so our file route can't stream them.
  const locked = file.locked_for_user || !file.url;
  const size = formatFileSize(file.size);
  const date = formatDate(file.updated_at);
  const explanation = plainText(file.lock_explanation) || 'This file is locked.';

  const inner = (
    <>
      <FileIcon contentType={file['content-type']} name={name} className={locked ? 'opacity-50' : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{name}</span>
          {locked && <LockSimpleIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Locked" role="img" />}
        </div>
        {locked ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{explanation}</p>
        ) : (
          <p className="flex gap-x-2 truncate text-xs text-muted-foreground @xl:hidden">
            {size && <span className="@md:hidden">{size}</span>}
            {date && <span>{date}</span>}
          </p>
        )}
      </div>
      <span className={cn(SIZE_COL, 'text-sm text-muted-foreground tabular-nums')}>{size}</span>
      <span className={cn(DATE_COL, 'text-sm text-muted-foreground')}>{date}</span>
    </>
  );

  return (
    <li className="flex items-center gap-3 pr-3 transition-colors hover:bg-muted/50 @md:pr-4">
      {locked ? (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-muted-foreground @md:pl-4">{inner}</div>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(file)}
          title={`Preview ${name}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-2.5 pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset @md:pl-4"
        >
          {inner}
        </button>
      )}
      <span className={ACTION_COL}>
        {locked ? (
          <Button variant="ghost" size="icon-sm" disabled aria-label={`${name} is locked`}>
            <DownloadSimpleIcon />
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon-sm">
                <a href={fileContentUrl(file.id, { download: true })} download aria-label={`Download ${name}`}>
                  <DownloadSimpleIcon />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download</TooltipContent>
          </Tooltip>
        )}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Loading, empty and error states
// ---------------------------------------------------------------------------

const SKELETON_WIDTHS = ['w-2/5', 'w-1/3', 'w-1/2', 'w-1/4', 'w-3/5', 'w-2/5'];

function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y" aria-busy="true" aria-label="Loading files">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-3 @md:px-4">
          <Skeleton className="h-5 w-5 shrink-0 rounded" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn('h-4', SKELETON_WIDTHS[index % SKELETON_WIDTHS.length])} />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="hidden h-4 w-14 @md:block" />
          <Skeleton className="hidden h-4 w-24 @xl:block" />
          <Skeleton className="h-8 w-8 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function StateMessage({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: PhosphorIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 rounded-full bg-muted p-3">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <ArrowClockwiseIcon /> Try again
    </Button>
  );
}

function RootError({ error, context, onRetry }: { error: Error; context: number | 'user'; onRetry: () => void }) {
  const pathname = usePathname();

  if (isSessionError(error)) {
    return (
      <StateMessage
        icon={LockSimpleIcon}
        title="Your session has expired"
        description="Sign in to Canvas Dashboard again to browse your files."
      />
    );
  }

  if (isAccessError(error)) {
    if (context === 'user') {
      return (
        <StateMessage
          icon={FolderDashedIcon}
          title="Personal files aren't available"
          description="Your school has turned off personal file storage in Canvas."
        />
      );
    }
    const coursePath = `/courses/${context}`;
    const insideCourse = pathname === coursePath || pathname.startsWith(`${coursePath}/`);
    return (
      <StateMessage
        icon={FolderDashedIcon}
        title="Files are turned off for this course"
        description={
          insideCourse
            ? 'Your instructor hid the Files page. Course materials are usually shared in Modules instead, so check the Modules tab.'
            : 'Your instructor hid the Files page. Course materials are usually shared in Modules instead, so check the course Modules.'
        }
        action={
          insideCourse ? undefined : (
            <Button asChild variant="outline" size="sm">
              <Link href={coursePath}>Open course</Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <StateMessage
      icon={WarningCircleIcon}
      title="Couldn't load files"
      description="Something went wrong talking to Canvas. Try again in a moment."
      action={<RetryButton onClick={onRetry} />}
    />
  );
}
