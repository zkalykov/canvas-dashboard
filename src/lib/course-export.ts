import { canvasServerFetch, type CanvasCredentials } from '@/lib/canvas-server';

/**
 * Server-only: turns Canvas course content (pages, assignments, discussions,
 * quizzes, announcements, syllabus, links) into standalone HTML files for the
 * course ZIP, plus the index.html that ties everything together.
 *
 * Links inside the content that point at something else in the ZIP (a file, page,
 * assignment...) are rewritten to the local copy, so the ZIP works offline.
 * Everything else points back to Canvas.
 */

export type ExportKind = 'file' | 'page' | 'assignment' | 'discussion' | 'quiz' | 'link' | 'syllabus' | 'announcements';

export interface ExportItem {
  kind: ExportKind;
  /** File/assignment/discussion/quiz id, page url slug, or the link's address. */
  ref: string;
  title: string;
  /** Final path inside the ZIP. */
  path: string;
  /** Section in index.html (a module, "Other files", ...). */
  group: string;
}

export const TYPE_LABEL: Record<ExportKind, string> = {
  file: 'File',
  page: 'Page',
  assignment: 'Assignment',
  discussion: 'Discussion',
  quiz: 'Quiz',
  link: 'Link',
  syllabus: 'Syllabus',
  announcements: 'Announcements',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Link from one file in the ZIP to another ("Modules/01 A/x.html" -> "../02 B/y.pdf"). */
export function relativePath(from: string, to: string): string {
  const fromDir = from.split('/').slice(0, -1);
  const target = to.split('/');
  let same = 0;
  while (same < fromDir.length && same < target.length - 1 && fromDir[same] === target[same]) same++;
  return [...fromDir.slice(same).map(() => '..'), ...target.slice(same).map(encodeURIComponent)].join('/');
}

export class ExportContext {
  /** "file:12", "page:week-1", "assignment:5" ... -> path in the ZIP. */
  private readonly local = new Map<string, string>();
  private readonly dateFormat: Intl.DateTimeFormat;

  constructor(
    private readonly creds: CanvasCredentials,
    private readonly courseId: string,
    readonly courseTitle: string,
    items: ExportItem[],
    timeZone: string | undefined
  ) {
    for (const item of items) {
      if (item.kind === 'link' || item.kind === 'syllabus' || item.kind === 'announcements') continue;
      this.local.set(`${item.kind}:${item.ref}`, item.path);
    }
    let format: Intl.DateTimeFormat;
    try {
      format = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone });
    } catch {
      format = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
    }
    this.dateFormat = format;
  }

  date(value: string | null | undefined): string | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : this.dateFormat.format(date);
  }

  private canvasUrl(path: string): string {
    return `${this.creds.baseUrl}${path}`;
  }

  private async get<T>(endpoint: string): Promise<T> {
    const res = await canvasServerFetch(this.creds, endpoint);
    if (!res.ok) throw new Error(`Canvas answered ${res.status}`);
    return (await res.json()) as T;
  }

  private async getAll<T>(endpoint: string, maxPages = 10): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = endpoint;
    for (let page = 0; next && page < maxPages; page++) {
      const res = await canvasServerFetch(this.creds, next);
      if (!res.ok) throw new Error(`Canvas answered ${res.status}`);
      const data = (await res.json()) as T[];
      if (Array.isArray(data)) out.push(...data);
      const link = res.headers.get('link') ?? '';
      next = link.match(/<([^>]+)>\s*;\s*rel="?next"?/)?.[1] ?? null;
    }
    return out;
  }

  /**
   * Canvas HTML with its links fixed for a file at `fromPath`: things in the ZIP
   * link to the local copy, other Canvas links become full Canvas addresses.
   */
  rewrite(html: string | null | undefined, fromPath: string): string {
    if (!html) return '';
    const base = new URL(this.creds.baseUrl);
    // Canvas already cleans course HTML; drop anything that could run code anyway.
    const safe = html.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/\s+on[a-z]+\s*=\s*(["']).*?\1/gi, '');
    return safe.replace(/\b(href|src)=(["'])(.*?)\2/gi, (whole, attr: string, quote: string, value: string) => {
      let url: URL;
      try {
        url = new URL(value.replace(/&amp;/g, '&'), base);
      } catch {
        return whole;
      }
      if (url.host === base.host) {
        const match =
          url.pathname.match(/\/courses\/\d+\/(files|assignments|pages|discussion_topics|quizzes)\/([^/?#]+)/) ??
          url.pathname.match(/\/(files)\/(\d+)/);
        if (match) {
          const kind = { files: 'file', assignments: 'assignment', pages: 'page', discussion_topics: 'discussion', quizzes: 'quiz' }[match[1]];
          const target = this.local.get(`${kind}:${decodeURIComponent(match[2])}`);
          if (target) return `${attr}=${quote}${escapeHtml(relativePath(fromPath, target))}${quote}`;
        }
      }
      if (url.protocol === 'data:' && attr.toLowerCase() === 'src') return whole;
      if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') return `${attr}=${quote}#${quote}`;
      return `${attr}=${quote}${escapeHtml(url.toString())}${quote}`;
    });
  }

  /** A complete, readable HTML page for one item. */
  document(item: ExportItem, options: { meta?: (string | null | undefined)[]; body: string; canvasHref?: string | null }): string {
    const meta = (options.meta ?? []).filter(Boolean) as string[];
    const back = relativePath(item.path, 'index.html');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(item.title)} · ${escapeHtml(this.courseTitle)}</title>
<style>
  body { font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; max-width: 780px; margin: 40px auto; padding: 0 20px; }
  a { color: #0b57d0; }
  .top, .meta, .foot { color: #666; font-size: 14px; }
  .meta span + span::before { content: " · "; }
  h1 { font-size: 28px; line-height: 1.25; margin: 12px 0 6px; }
  img, video, iframe { max-width: 100%; height: auto; }
  table { border-collapse: collapse; } td, th { border: 1px solid #ddd; padding: 6px 8px; }
  .entry { border-left: 3px solid #e5e5e5; padding: 2px 0 2px 14px; margin: 18px 0; }
  .entry .entry { margin-left: 8px; }
  .who { font-size: 14px; color: #555; }
  hr { border: 0; border-top: 1px solid #e5e5e5; margin: 32px 0; }
  @media (prefers-color-scheme: dark) { body { background: #1c1c1c; color: #eee; } a { color: #8ab4f8; } .entry { border-color: #333; } }
</style>
</head>
<body>
<p class="top"><a href="${escapeHtml(back)}">← ${escapeHtml(this.courseTitle)}</a> · ${escapeHtml(TYPE_LABEL[item.kind])}</p>
<h1>${escapeHtml(item.title)}</h1>
${meta.length ? `<p class="meta">${meta.map(m => `<span>${escapeHtml(m)}</span>`).join('')}</p>` : ''}
<div class="content">
${options.body || '<p class="meta">No description.</p>'}
</div>
${options.canvasHref ? `<p class="foot"><a href="${escapeHtml(options.canvasHref)}">Open in Canvas</a></p>` : ''}
</body>
</html>
`;
  }

  /** The HTML file for a non-file item. */
  async render(item: ExportItem): Promise<{ html: string; updatedAt?: string }> {
    const c = this.courseId;
    switch (item.kind) {
      case 'page': {
        const page = await this.get<{ title: string; body?: string; updated_at?: string; html_url?: string }>(
          `/courses/${c}/pages/${encodeURIComponent(item.ref)}`
        );
        return {
          html: this.document(item, {
            meta: [page.updated_at ? `Updated ${this.date(page.updated_at)}` : null],
            body: this.rewrite(page.body, item.path),
            canvasHref: page.html_url ?? this.canvasUrl(`/courses/${c}/pages/${encodeURIComponent(item.ref)}`),
          }),
          updatedAt: page.updated_at,
        };
      }
      case 'assignment': {
        const a = await this.get<{
          name: string;
          description?: string | null;
          due_at?: string | null;
          lock_at?: string | null;
          points_possible?: number | null;
          submission_types?: string[];
          html_url?: string;
          updated_at?: string;
          submission?: { score?: number | null; grade?: string | null; submitted_at?: string | null; missing?: boolean };
        }>(`/courses/${c}/assignments/${item.ref}?include[]=submission`);
        const types = (a.submission_types ?? []).filter(t => t !== 'none').map(t => t.replace(/_/g, ' '));
        const sub = a.submission;
        return {
          html: this.document(item, {
            meta: [
              a.due_at ? `Due ${this.date(a.due_at)}` : 'No due date',
              typeof a.points_possible === 'number' ? `${a.points_possible} points` : null,
              types.length ? `Submit: ${types.join(', ')}` : null,
              a.lock_at ? `Closes ${this.date(a.lock_at)}` : null,
              typeof sub?.score === 'number' ? `Your score: ${sub.score}${typeof a.points_possible === 'number' ? ` / ${a.points_possible}` : ''}` : null,
              sub?.submitted_at ? `Submitted ${this.date(sub.submitted_at)}` : sub?.missing ? 'Missing' : null,
            ],
            body: this.rewrite(a.description, item.path),
            canvasHref: a.html_url,
          }),
          updatedAt: a.updated_at,
        };
      }
      case 'quiz': {
        const q = await this.get<{
          title: string;
          description?: string | null;
          due_at?: string | null;
          points_possible?: number | null;
          time_limit?: number | null;
          allowed_attempts?: number | null;
          question_count?: number | null;
          html_url?: string;
        }>(`/courses/${c}/quizzes/${item.ref}`);
        return {
          html: this.document(item, {
            meta: [
              q.due_at ? `Due ${this.date(q.due_at)}` : null,
              typeof q.points_possible === 'number' ? `${q.points_possible} points` : null,
              q.question_count ? `${q.question_count} questions` : null,
              q.time_limit ? `${q.time_limit} minutes` : null,
              q.allowed_attempts && q.allowed_attempts > 0 ? `${q.allowed_attempts} attempt${q.allowed_attempts === 1 ? '' : 's'}` : null,
            ],
            body: this.rewrite(q.description, item.path),
            canvasHref: q.html_url,
          }),
        };
      }
      case 'discussion': {
        const topic = await this.get<{
          title: string;
          message?: string | null;
          posted_at?: string | null;
          author?: { display_name?: string };
          html_url?: string;
          last_reply_at?: string | null;
        }>(`/courses/${c}/discussion_topics/${item.ref}`);
        // The replies, when this student can see them (some topics need your own post first).
        let replies = '';
        try {
          const view = await this.get<{ participants?: { id: number; display_name: string }[]; view?: Entry[] }>(
            `/courses/${c}/discussion_topics/${item.ref}/view`
          );
          const names = new Map((view.participants ?? []).map(p => [p.id, p.display_name]));
          const renderEntries = (entries: Entry[] = []): string =>
            entries
              .filter(e => !e.deleted)
              .map(
                e => `<div class="entry"><p class="who"><strong>${escapeHtml(names.get(e.user_id ?? -1) ?? 'Someone')}</strong> · ${escapeHtml(this.date(e.created_at) ?? '')}</p>${this.rewrite(e.message, item.path)}${renderEntries(e.replies)}</div>`
              )
              .join('\n');
          const rendered = renderEntries(view.view);
          if (rendered) replies = `<hr><h2>Replies</h2>\n${rendered}`;
        } catch {
          // replies not visible
        }
        return {
          html: this.document(item, {
            meta: [topic.author?.display_name ? `By ${topic.author.display_name}` : null, topic.posted_at ? `Posted ${this.date(topic.posted_at)}` : null],
            body: this.rewrite(topic.message, item.path) + replies,
            canvasHref: topic.html_url,
          }),
          updatedAt: topic.last_reply_at ?? topic.posted_at ?? undefined,
        };
      }
      case 'syllabus': {
        const course = await this.get<{ syllabus_body?: string | null }>(`/courses/${c}?include[]=syllabus_body`);
        return {
          html: this.document(item, { body: this.rewrite(course.syllabus_body, item.path), canvasHref: this.canvasUrl(`/courses/${c}/assignments/syllabus`) }),
        };
      }
      case 'announcements': {
        const params = new URLSearchParams({
          'context_codes[]': `course_${c}`,
          start_date: '2000-01-01T00:00:00Z',
          end_date: new Date(Date.now() + 86_400_000).toISOString(),
          per_page: '100',
        });
        const list = await this.getAll<{ title: string; message?: string; posted_at: string; author?: { display_name?: string }; html_url?: string }>(
          `/announcements?${params}`
        );
        list.sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
        const body = list.length
          ? list
              .map(
                a => `<article class="entry"><h2>${escapeHtml(a.title)}</h2><p class="who">${escapeHtml([a.author?.display_name, this.date(a.posted_at)].filter(Boolean).join(' · '))}${a.html_url ? ` · <a href="${escapeHtml(a.html_url)}">Open in Canvas</a>` : ''}</p>${this.rewrite(a.message, item.path)}</article>`
              )
              .join('\n')
          : '<p class="meta">No announcements.</p>';
        return { html: this.document(item, { meta: [`${list.length} announcement${list.length === 1 ? '' : 's'}`], body }) };
      }
      case 'link': {
        const href = escapeHtml(item.ref);
        return { html: this.document(item, { body: `<p><a href="${href}">${href}</a></p>` }) };
      }
      default:
        throw new Error('Not a document');
    }
  }

  /** index.html: every section in order, linking to each item (or saying it failed). */
  index(items: ExportItem[], failed: Map<string, string>): string {
    const sections = new Map<string, ExportItem[]>();
    for (const item of items) sections.set(item.group, [...(sections.get(item.group) ?? []), item]);
    const body = [...sections.entries()]
      .map(
        ([group, list]) => `<h2>${escapeHtml(group)}</h2>\n<ul>\n${list
          .map(item => {
            const error = failed.get(item.path);
            const label = `<span class="type">${escapeHtml(TYPE_LABEL[item.kind])}</span>`;
            return error
              ? `<li>${escapeHtml(item.title)} ${label} <span class="err">not downloaded: ${escapeHtml(error)}</span></li>`
              : `<li><a href="${escapeHtml(relativePath('index.html', item.path))}">${escapeHtml(item.title)}</a> ${label}</li>`;
          })
          .join('\n')}\n</ul>`
      )
      .join('\n');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(this.courseTitle)}</title>
<style>
  body { font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; max-width: 780px; margin: 40px auto; padding: 0 20px; }
  a { color: #0b57d0; } h1 { font-size: 30px; margin-bottom: 4px; } h2 { font-size: 19px; margin-top: 30px; }
  ul { padding-left: 20px; } li { margin: 4px 0; }
  .note, .type { color: #666; font-size: 13px; } .err { color: #b3261e; font-size: 13px; }
  @media (prefers-color-scheme: dark) { body { background: #1c1c1c; color: #eee; } a { color: #8ab4f8; } }
</style>
</head>
<body>
<h1>${escapeHtml(this.courseTitle)}</h1>
<p class="note">Downloaded ${escapeHtml(this.date(new Date().toISOString()) ?? '')} from Canvas. Everything below works offline; "Open in Canvas" links need you to be online and logged in.</p>
${body}
</body>
</html>
`;
  }
}

interface Entry {
  user_id?: number;
  message?: string;
  created_at?: string;
  deleted?: boolean;
  replies?: Entry[];
}
