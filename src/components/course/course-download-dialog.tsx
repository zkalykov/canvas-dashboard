'use client';

import { useMemo, useState } from 'react';
import {
  BookOpenIcon,
  ChatsIcon,
  CircleNotchIcon,
  ClipboardTextIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  FolderSimpleIcon,
  InfoIcon,
  LinkSimpleIcon,
  ListChecksIcon,
  MegaphoneSimpleIcon,
  StackIcon,
} from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import canvasApi from '@/lib/canvas-api';
import { useCanvasData, useCourse, useModules, usePages } from '@/hooks/use-canvas';
import { formatFileSize } from '@/lib/files';
import type { Assignment, CanvasFile, CanvasFolder, DiscussionTopic } from '@/lib/types';
import { FileIcon } from '@/components/files/file-icon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * "Download course": everything from a course in one ZIP. Modules come first, in
 * order, each as a numbered folder with its files plus its pages, assignments,
 * discussions, quizzes and links saved as readable HTML. Then the syllabus,
 * announcements, whatever isn't in a module, and the remaining files by folder.
 * The server (/api/files/zip) builds the ZIP and an index.html that links it all.
 */

type Kind = 'file' | 'page' | 'assignment' | 'discussion' | 'quiz' | 'link' | 'syllabus' | 'announcements';

interface Row {
  key: string;
  kind: Kind;
  /** What the server fetches: an id, a page url, or a link address. */
  ref: string;
  title: string;
  /** Path inside the ZIP. */
  path: string;
  size?: number;
  contentType?: string;
  locked?: boolean;
}

interface Group {
  key: string;
  label: string;
  icon: PhosphorIcon;
  rows: Row[];
}

const KIND_ICON: Record<Exclude<Kind, 'file'>, PhosphorIcon> = {
  page: FileTextIcon,
  assignment: ClipboardTextIcon,
  discussion: ChatsIcon,
  quiz: ListChecksIcon,
  link: LinkSimpleIcon,
  syllabus: BookOpenIcon,
  announcements: MegaphoneSimpleIcon,
};
const KIND_LABEL: Record<Kind, string> = {
  file: 'File',
  page: 'Page',
  assignment: 'Assignment',
  discussion: 'Discussion',
  quiz: 'Quiz',
  link: 'Link',
  syllabus: 'Syllabus',
  announcements: 'Announcements',
};

const BIG_DOWNLOAD = 1024 ** 3; // 1 GB
const FRAME = 'course-download';

/** A title as one path segment ("Week 1/2" must not become two folders). */
const segment = (text: string) => text.replace(/[\\/]+/g, '-').trim() || 'Untitled';
const numbered = (n: number, count: number) => String(n).padStart(count >= 100 ? 3 : 2, '0');

/** Loads single files a few at a time; ones that can't be read (locked, removed) are skipped. */
async function loadFiles(ids: number[]): Promise<CanvasFile[]> {
  const out: CanvasFile[] = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        out.push(await canvasApi.getFile(id));
      } catch {
        // not available to this student
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
  return out;
}

/** "course files/Week 1/Slides" -> "Week 1/Slides" (the course's top folder is left out). */
function folderPath(folder: CanvasFolder | undefined): string {
  return (folder?.full_name ?? '').split('/').slice(1).join('/');
}

function fileRow(file: CanvasFile, path: string): Row {
  return {
    key: `file:${file.id}`,
    kind: 'file',
    ref: String(file.id),
    title: file.display_name || file.filename || `file-${file.id}`,
    path,
    size: file.size ?? 0,
    contentType: file['content-type'],
    locked: file.locked_for_user || !file.url,
  };
}

export function CourseDownloadDialog({
  courseId,
  courseLabel,
  courseTitle,
  open,
  onOpenChange,
}: {
  courseId: number;
  /** Short name for the ZIP ("BIO101"). */
  courseLabel: string;
  /** Full name for index.html. */
  courseTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = open ? courseId : null;
  const course = useCourse(id);
  const modules = useModules(id);
  const pages = usePages(id);
  // Same key as useAssignments(courseId), so a course page that already loaded them shares the data.
  const assignments = useCanvasData<Assignment[]>(id ? `canvas_assignments_${id}` : null, () => canvasApi.getAssignments(courseId));
  const discussions = useCanvasData<DiscussionTopic[]>(id ? `canvas_course_discussions_${id}` : null, () =>
    canvasApi.getDiscussionTopics(courseId)
  );
  const files = useCanvasData<CanvasFile[]>(id ? `canvas_course_files_${id}` : null, () => canvasApi.getCourseFiles(courseId));
  const folders = useCanvasData<CanvasFolder[]>(id ? `canvas_course_folders_${id}` : null, () => canvasApi.getCourseFolders(courseId));

  // Files linked in modules that the course file list doesn't have (or can't show).
  const extraIds = useMemo(() => {
    if (files.loading || !modules.data) return [];
    const known = new Set((files.data ?? []).map(f => f.id));
    const ids = new Set<number>();
    for (const courseModule of modules.data) {
      for (const item of courseModule.items ?? []) {
        if (item.type === 'File' && item.content_id && !known.has(item.content_id)) ids.add(item.content_id);
      }
    }
    return [...ids];
  }, [files.loading, files.data, modules.data]);
  const extra = useCanvasData<CanvasFile[]>(
    open && extraIds.length > 0 ? `canvas_module_files_${courseId}_${extraIds.join(',')}` : null,
    () => loadFiles(extraIds)
  );

  const loading =
    course.loading || modules.loading || pages.loading || assignments.loading || discussions.loading || files.loading || folders.loading || extra.loading;

  const groups = useMemo<Group[]>(() => {
    if (loading) return [];
    const fileById = new Map<number, CanvasFile>([...(files.data ?? []), ...(extra.data ?? [])].map(f => [f.id, f]));
    const used = { file: new Set<number>(), page: new Set<string>(), assignment: new Set<number>(), quiz: new Set<number>(), discussion: new Set<number>() };
    const out: Group[] = [];

    // 1. Course info
    const info: Row[] = [];
    if (course.data?.syllabus_body?.trim()) {
      info.push({ key: 'syllabus', kind: 'syllabus', ref: '', title: 'Syllabus', path: 'Syllabus.html' });
    }
    info.push({ key: 'announcements', kind: 'announcements', ref: '', title: 'Announcements', path: 'Announcements.html' });
    out.push({ key: 'info', label: 'Course info', icon: InfoIcon, rows: info });

    // 2. Modules, in order
    const moduleList = [...(modules.data ?? [])].sort((a, b) => a.position - b.position);
    moduleList.forEach((courseModule, mi) => {
      const folder = `Modules/${numbered(mi + 1, moduleList.length)} ${segment(courseModule.name)}`;
      const items = (courseModule.items ?? []).filter(item => item.type !== 'SubHeader').sort((a, b) => a.position - b.position);
      const rows: Row[] = [];
      items.forEach((item, ii) => {
        const prefix = `${folder}/${numbered(ii + 1, items.length)} `;
        const title = item.title || 'Untitled';
        const doc = (kind: Kind, ref: string, suffix: string): Row => ({
          key: `${kind}:${ref}:${courseModule.id}:${item.id}`,
          kind,
          ref,
          title,
          path: `${prefix}${segment(title)}${suffix}.html`,
        });
        if (item.type === 'File' && item.content_id) {
          const file = fileById.get(item.content_id);
          if (file) {
            used.file.add(file.id);
            rows.push({ ...fileRow(file, `${prefix}${segment(file.display_name || title)}`), key: `file:${file.id}:${item.id}` });
          } else {
            rows.push({ key: `file:${item.content_id}:${item.id}`, kind: 'file', ref: String(item.content_id), title, path: `${prefix}${segment(title)}`, locked: true });
          }
        } else if (item.type === 'Page' && item.page_url) {
          used.page.add(item.page_url);
          rows.push(doc('page', item.page_url, ''));
        } else if (item.type === 'Assignment' && item.content_id) {
          used.assignment.add(item.content_id);
          rows.push(doc('assignment', String(item.content_id), ' (assignment)'));
        } else if (item.type === 'Quiz' && item.content_id) {
          used.quiz.add(item.content_id);
          rows.push(doc('quiz', String(item.content_id), ' (quiz)'));
        } else if (item.type === 'Discussion' && item.content_id) {
          used.discussion.add(item.content_id);
          rows.push(doc('discussion', String(item.content_id), ' (discussion)'));
        } else if (item.type === 'ExternalUrl' && item.external_url) {
          rows.push(doc('link', item.external_url, ' (link)'));
        } else if (item.type === 'ExternalTool' && item.html_url) {
          rows.push(doc('link', item.html_url, ' (link)'));
        }
      });
      if (rows.length) out.push({ key: `module:${courseModule.id}`, label: courseModule.name, icon: StackIcon, rows });
    });

    // 3. What isn't in a module
    const graded = new Set<number>();
    const otherAssignments = (assignments.data ?? []).filter(a => {
      const topicId = (a as { discussion_topic?: { id?: number } }).discussion_topic?.id;
      if (topicId) graded.add(topicId);
      return !used.assignment.has(a.id) && !(a.quiz_id && used.quiz.has(a.quiz_id)) && !(topicId && used.discussion.has(topicId));
    });
    if (otherAssignments.length) {
      out.push({
        key: 'assignments',
        label: 'Other assignments',
        icon: ClipboardTextIcon,
        rows: otherAssignments.map(a => ({ key: `assignment:${a.id}`, kind: 'assignment', ref: String(a.id), title: a.name, path: `Assignments/${segment(a.name)}.html` })),
      });
    }
    const otherPages = (pages.data ?? []).filter(p => !used.page.has(p.url));
    if (otherPages.length) {
      out.push({
        key: 'pages',
        label: 'Other pages',
        icon: FileTextIcon,
        rows: otherPages.map(p => ({ key: `page:${p.url}`, kind: 'page', ref: p.url, title: p.title, path: `Pages/${segment(p.title)}.html` })),
      });
    }
    // Graded discussions already come with their assignment.
    const otherTopics = (discussions.data ?? []).filter(t => !used.discussion.has(t.id) && !graded.has(t.id));
    if (otherTopics.length) {
      out.push({
        key: 'discussions',
        label: 'Other discussions',
        icon: ChatsIcon,
        rows: otherTopics.map(t => ({ key: `discussion:${t.id}`, kind: 'discussion', ref: String(t.id), title: t.title, path: `Discussions/${segment(t.title)}.html` })),
      });
    }

    // 4. Files that aren't in a module, by folder
    const byFolder = new Map<number, CanvasFolder>((folders.data ?? []).map(f => [f.id, f]));
    const fileGroups = new Map<string, Row[]>();
    for (const file of files.data ?? []) {
      if (used.file.has(file.id)) continue;
      const path = folderPath(byFolder.get(file.folder_id));
      const name = segment(file.display_name || file.filename || `file-${file.id}`);
      fileGroups.set(path, [...(fileGroups.get(path) ?? []), fileRow(file, `Files/${path ? `${path}/` : ''}${name}`)]);
    }
    [...fileGroups.entries()]
      .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
      .forEach(([path, rows]) =>
        out.push({
          key: `folder:${path}`,
          label: path ? `Files / ${path.split('/').join(' / ')}` : 'Files',
          icon: FolderSimpleIcon,
          rows: rows.sort((a, b) => a.title.localeCompare(b.title)),
        })
      );
    return out;
  }, [loading, course.data, modules.data, pages.data, assignments.data, discussions.data, files.data, folders.data, extra.data]);

  const available = useMemo(() => groups.flatMap(g => g.rows).filter(r => !r.locked), [groups]);
  // Everything starts selected; we remember what was unticked.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const selected = available.filter(r => !excluded.has(r.key));
  const selectedSize = selected.reduce((sum, r) => sum + (r.size ?? 0), 0);
  const selectedFiles = selected.filter(r => r.kind === 'file').length;
  const [status, setStatus] = useState<{ kind: 'idle' | 'starting' | 'started' | 'error'; message?: string }>({ kind: 'idle' });

  const setIncluded = (keys: string[], include: boolean) =>
    setExcluded(prev => {
      const next = new Set(prev);
      for (const key of keys) {
        if (include) next.delete(key);
        else next.add(key);
      }
      return next;
    });

  const checkState = (rows: Row[]): boolean | 'indeterminate' => {
    const usable = rows.filter(r => !r.locked);
    const on = usable.filter(r => !excluded.has(r.key)).length;
    return on === 0 ? false : on === usable.length ? true : 'indeterminate';
  };

  const download = async () => {
    setStatus({ kind: 'starting' });
    // Check the session first: the ZIP opens in a hidden frame, so errors there would be invisible.
    const check = await fetch('/api/auth/activity', { method: 'POST' }).catch(() => null);
    if (!check || !check.ok) {
      if (check?.status === 401) window.dispatchEvent(new Event('canvas:unauthorized'));
      setStatus({
        kind: 'error',
        message: check?.status === 401 ? 'Your session ended. Log in again to download.' : "Couldn't start the download. Try again in a minute.",
      });
      return;
    }
    const groupOf = new Map(groups.flatMap(g => g.rows.map(r => [r.key, g.label] as const)));
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/files/zip';
    form.target = FRAME;
    const add = (name: string, value: string) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };
    add('course', String(courseId));
    add('title', courseTitle);
    add('name', `${courseLabel} course`);
    add('tz', Intl.DateTimeFormat().resolvedOptions().timeZone ?? '');
    add('items', JSON.stringify(selected.map(r => ({ kind: r.kind, ref: r.ref, title: r.title, path: r.path, group: groupOf.get(r.key) }))));
    document.body.appendChild(form);
    form.submit();
    form.remove();
    setStatus({ kind: 'started' });
  };

  const allState = checkState(available);
  const summary = `${selected.length} of ${available.length} items${selectedFiles ? ` · ${selectedFiles} files, ${formatFileSize(selectedSize) || '0 B'}` : ''}`;

  return (
    <>
      <iframe name={FRAME} title="Course download" hidden />
      <Dialog
        open={open}
        onOpenChange={next => {
          if (!next) setStatus({ kind: 'idle' });
          onOpenChange(next);
        }}
      >
        <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="p-6 pb-4 text-left">
            <DialogTitle>Download this course</DialogTitle>
            <DialogDescription>
              Everything from {courseLabel} in one ZIP: every module in order with its files, pages, assignments,
              discussions and quizzes, plus the syllabus, announcements and all course files. Open index.html to study
              offline, for example before exams. Untick anything you don&apos;t need.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 border-y px-6 py-2.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-medium">
              <Checkbox
                checked={allState}
                disabled={available.length === 0}
                onCheckedChange={value => setIncluded(available.map(r => r.key), value === true)}
                aria-label="Select everything"
              />
              Select all
            </label>
            <span className="text-right text-[13px] tabular-nums text-muted-foreground">{loading ? 'Gathering the course…' : summary}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {loading ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-9 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              groups.map(group => {
                const keys = group.rows.filter(r => !r.locked).map(r => r.key);
                const GroupIcon = group.icon;
                return (
                  <section key={group.key} className="py-1">
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-muted/70">
                      <Checkbox
                        checked={checkState(group.rows)}
                        disabled={keys.length === 0}
                        onCheckedChange={value => setIncluded(keys, value === true)}
                        aria-label={`Select ${group.label}`}
                      />
                      <GroupIcon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{group.label}</span>
                      <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                        {group.rows.length} {group.rows.length === 1 ? 'item' : 'items'}
                      </span>
                    </label>
                    {group.rows.map(row => {
                      const RowIcon = row.kind === 'file' ? null : KIND_ICON[row.kind];
                      return (
                        <label
                          key={row.key}
                          className={cn(
                            'flex items-center gap-2.5 rounded-lg py-1.5 pl-9 pr-3',
                            row.locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-muted/70'
                          )}
                        >
                          <Checkbox
                            checked={!row.locked && !excluded.has(row.key)}
                            disabled={row.locked}
                            onCheckedChange={value => setIncluded([row.key], value === true)}
                            aria-label={row.title}
                          />
                          {RowIcon ? (
                            <RowIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <FileIcon contentType={row.contentType} name={row.title} className="h-4 w-4 shrink-0" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13px]">{row.title}</span>
                          <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                            {row.locked ? 'Locked' : row.kind === 'file' ? formatFileSize(row.size) : KIND_LABEL[row.kind]}
                          </span>
                        </label>
                      );
                    })}
                  </section>
                );
              })
            )}
          </div>

          <DialogFooter className="flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className={cn('text-[12px] sm:max-w-[55%]', status.kind === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
              {status.kind === 'error'
                ? status.message
                : status.kind === 'started'
                  ? 'Your download has started. Your browser shows its progress.'
                  : selectedSize > BIG_DOWNLOAD
                    ? 'This is a big download (over 1 GB) and can take several minutes.'
                    : 'Modules keep their order, files keep their folders.'}
            </p>
            <Button onClick={download} disabled={loading || selected.length === 0 || status.kind === 'starting'} className="w-full sm:w-auto">
              {status.kind === 'starting' ? <CircleNotchIcon className="animate-spin" /> : <DownloadSimpleIcon />}
              {selected.length === 0
                ? 'Choose what to download'
                : `Download ${selected.length} ${selected.length === 1 ? 'item' : 'items'}${selectedSize ? ` (${formatFileSize(selectedSize)})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
