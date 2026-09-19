import { NextRequest, NextResponse } from 'next/server';
import { makeZip } from 'client-zip';
import { isSameOriginRequest, requireCanvasSession } from '@/lib/canvas-server';
import { openCanvasFile } from '@/lib/canvas-files-server';
import { ExportContext, type ExportItem, type ExportKind } from '@/lib/course-export';

// Big course downloads stream for a while.
export const maxDuration = 300;

const MAX_ITEMS = 1500;
/** Items fetched ahead of the one being written, so the ZIP doesn't wait on each one. */
const LOOKAHEAD = 4;
const KINDS = new Set<ExportKind>(['file', 'page', 'assignment', 'discussion', 'quiz', 'link', 'syllabus', 'announcements']);

/** A safe path inside the ZIP: no "..", no absolute paths, no characters Windows rejects. */
function cleanPath(path: string, fallback: string): string {
  const parts = path
    .split(/[\\/]+/)
    .map(part => part.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim().slice(0, 120))
    .filter(part => part && part !== '.' && part !== '..');
  return parts.length ? parts.join('/') : fallback;
}

/** "notes.pdf" twice becomes "notes.pdf" and "notes (2).pdf". */
function uniquePaths(paths: string[]): string[] {
  const seen = new Map<string, number>([['index.html', 1]]);
  return paths.map(path => {
    const key = path.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 1) return path;
    const dot = path.lastIndexOf('.');
    const slash = path.lastIndexOf('/');
    return dot > slash + 1 ? `${path.slice(0, dot)} (${count})${path.slice(dot)}` : `${path} (${count})`;
  });
}

function validRef(kind: ExportKind, ref: string): boolean {
  if (kind === 'syllabus' || kind === 'announcements') return true;
  if (kind === 'page') return /^[^/?#\s]{1,200}$/.test(ref);
  if (kind === 'link') {
    try {
      const url = new URL(ref);
      return (url.protocol === 'https:' || url.protocol === 'http:') && ref.length <= 2000;
    } catch {
      return false;
    }
  }
  return /^\d{1,15}$/.test(ref);
}

type Produced = { ok: true; input: ReadableStream<Uint8Array> | string; lastModified?: Date } | { ok: false; error: string };

/**
 * Downloads a course as one ZIP, streamed as it is built: files as they are,
 * pages/assignments/discussions/quizzes/announcements/syllabus/links as readable
 * HTML, and an index.html that links everything (works offline).
 * Form fields: `course` (id), `title`, `name` (the ZIP's name), `tz` (time zone
 * for dates) and `items`: a JSON list of { kind, ref, title, path, group }.
 * Reading only, so view-only sessions may use it.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-site request refused' }, { status: 403 });
  }
  const session = await requireCanvasSession();
  if (session.error) return session.error;
  const { creds } = session;

  const form = await request.formData();
  const courseId = String(form.get('course') ?? '');
  if (!/^\d+$/.test(courseId)) return NextResponse.json({ error: 'Missing course' }, { status: 400 });
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get('items') ?? '[]'));
  } catch {
    return NextResponse.json({ error: 'Invalid item list' }, { status: 400 });
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Choose between 1 and ${MAX_ITEMS} items` }, { status: 400 });
  }
  const valid = raw
    .map(entry => entry as Partial<Record<keyof ExportItem, unknown>>)
    .filter(
      entry =>
        KINDS.has(entry.kind as ExportKind) &&
        typeof entry.ref === 'string' &&
        typeof entry.path === 'string' &&
        typeof entry.title === 'string' &&
        validRef(entry.kind as ExportKind, entry.ref)
    ) as unknown as ExportItem[];
  const paths = uniquePaths(valid.map((item, i) => cleanPath(item.path, `item-${i + 1}`)));
  const items: ExportItem[] = valid.map((item, i) => ({
    kind: item.kind,
    ref: item.ref,
    title: item.title.slice(0, 300) || 'Untitled',
    path: paths[i],
    group: typeof item.group === 'string' && item.group ? item.group.slice(0, 200) : 'Course',
  }));

  const courseTitle = String(form.get('title') ?? '').slice(0, 200) || 'Course';
  const zipName = cleanPath(String(form.get('name') ?? ''), 'Course').replace(/\//g, ' ').replace(/\.zip$/i, '') + '.zip';
  const context = new ExportContext(creds, courseId, courseTitle, items, String(form.get('tz') ?? '') || undefined);

  const produce = async (item: ExportItem): Promise<Produced> => {
    try {
      if (item.kind === 'file') {
        const file = await openCanvasFile(creds, item.ref);
        if (!file.ok) return { ok: false, error: file.error };
        const modified = file.meta.modified_at || file.meta.updated_at;
        return { ok: true, input: file.upstream.body, lastModified: modified ? new Date(modified) : undefined };
      }
      const doc = await context.render(item);
      return { ok: true, input: doc.html, lastModified: doc.updatedAt ? new Date(doc.updatedAt) : undefined };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'failed' };
    }
  };

  async function* entries() {
    const pending = new Map<number, Promise<Produced>>();
    const start = (i: number) => {
      if (i < items.length && !pending.has(i)) pending.set(i, produce(items[i]));
    };
    const failed = new Map<string, string>();
    try {
      for (let i = 0; i < items.length; i++) {
        for (let k = i; k < i + LOOKAHEAD; k++) start(k);
        const result = await pending.get(i)!;
        pending.delete(i);
        if (!result.ok) {
          failed.set(items[i].path, result.error);
          continue;
        }
        yield { name: items[i].path, input: result.input, lastModified: result.lastModified };
      }
      yield { name: 'index.html', input: context.index(items, failed), lastModified: new Date() };
    } finally {
      // Stopped early (for example the download was cancelled): let go of files fetched ahead.
      for (const promise of pending.values()) {
        promise
          .then(result => {
            if (result.ok && typeof result.input !== 'string') void result.input.cancel().catch(() => {});
          })
          .catch(() => {});
      }
    }
  }

  const asciiName = zipName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return new NextResponse(makeZip(entries()), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
