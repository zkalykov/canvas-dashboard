import { CanvasApiError } from '@/lib/canvas-api';

/**
 * Pulls the human-readable message out of a Canvas error body. Canvas uses a few
 * shapes: {errors:[{message}]}, {errors:{base:[{message}]}}, {message}, {errors:"..."}.
 */
function messageFrom(value: unknown, insideErrors = false): string | null {
  if (!value) return null;
  if (typeof value === 'string') return insideErrors ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = messageFrom(item, insideErrors);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message) return obj.message;
    if ('errors' in obj) return messageFrom(obj.errors, true);
    if (insideErrors) {
      for (const item of Object.values(obj)) {
        const found = messageFrom(item, true);
        if (found) return found;
      }
    }
  }
  return null;
}

/** Friendly message for anything thrown by canvasApi (or a plain Error). */
export function canvasErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof CanvasApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.';
    let detail: string | null = null;
    if (err.details) {
      try {
        detail = messageFrom(JSON.parse(err.details));
      } catch {
        detail = null;
      }
    }
    if (detail) return detail;
    if (err.status === 403) return "Canvas says you don't have permission to do that.";
    if (err.status === 404) return "Canvas couldn't find this item.";
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** "3 hours late", "2 days late"... from Canvas `seconds_late`. */
export function formatLateness(secondsLate: number | null | undefined): string {
  const seconds = Math.max(0, secondsLate ?? 0);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (seconds < 60) return 'Less than a minute late';
  if (seconds < 3600) return `${plural(Math.floor(seconds / 60), 'minute')} late`;
  if (seconds < 48 * 3600) return `${plural(Math.floor(seconds / 3600), 'hour')} late`;
  return `${plural(Math.floor(seconds / 86400), 'day')} late`;
}

/** Trims trailing zeros: 9.5 -> "9.5", 10 -> "10", 7.3333 -> "7.33". */
export function formatPoints(points: number | null | undefined): string {
  if (points === null || points === undefined || Number.isNaN(points)) return '–';
  return String(Math.round(points * 100) / 100);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Plain textarea text -> safe HTML paragraphs (Canvas stores text entries/essays as HTML). */
export function plainTextToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** Canvas HTML -> editable plain text (browser only; never executes the HTML). */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, '\n\n');
  if (typeof DOMParser === 'undefined') return withBreaks.replace(/<[^>]*>/g, '').trim();
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Normalizes a user-typed URL, adding https:// when the scheme is missing. Returns null if invalid. */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.toString();
  } catch {
    return null;
  }
}
