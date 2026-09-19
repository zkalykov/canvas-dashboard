/**
 * Shared (client + server) helpers for Canvas files.
 * Bytes are always served through /api/files/:id so the Canvas token stays server-side.
 */

export type FileKind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other';

const INLINE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/avif']);
const TEXT_TYPES = new Set(['text/plain', 'text/csv', 'text/markdown']);

const MEDIA_TYPE = /^(video|audio)\/[a-z0-9][a-z0-9.+-]*$/;

function baseType(contentType: string | undefined | null): string {
  return (contentType || '').toLowerCase().split(';')[0].trim();
}

/**
 * What kind of file this is, from its MIME type. The name's extension is only a
 * fallback when Canvas has no real type (so "notes.pdf" stored as text/html is "other").
 */
export function fileKind(contentType: string | undefined | null, filename = ''): FileKind {
  const type = baseType(contentType);
  if (INLINE_IMAGE_TYPES.has(type)) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (MEDIA_TYPE.test(type)) return type.startsWith('video/') ? 'video' : 'audio';
  if (TEXT_TYPES.has(type)) return 'text';
  if (!type || type === 'application/octet-stream') {
    const ext = filename.toLowerCase().split('.').pop() || '';
    if (ext === 'pdf') return 'pdf';
    if (['txt', 'csv', 'md'].includes(ext)) return 'text';
  }
  return 'other';
}

/**
 * The Content-Type the server sends for an inline file: always one of a fixed set,
 * never Canvas's value as-is, so nothing can be served as HTML or script.
 */
export function inlineContentType(kind: FileKind, contentType: string | undefined | null): string | null {
  const type = baseType(contentType);
  if (kind === 'image') return INLINE_IMAGE_TYPES.has(type) ? type : null;
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'video' || kind === 'audio') return MEDIA_TYPE.test(type) ? type : null;
  if (kind === 'text') return 'text/plain; charset=utf-8';
  return null;
}

/** URL that streams a Canvas file through our server (inline preview or download). */
export function fileContentUrl(fileId: number, options: { download?: boolean } = {}): string {
  return `/api/files/${fileId}${options.download ? '?download=1' : ''}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
