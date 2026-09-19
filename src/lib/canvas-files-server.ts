import { canvasServerFetch, type CanvasCredentials } from '@/lib/canvas-server';
import { isPublicHttpsUrl } from '@/lib/public-address';
import type { CanvasFile } from '@/lib/types';

/**
 * Server-only: opens a Canvas file for streaming. Used by /api/files/:id (one file)
 * and /api/files/zip (many files in one ZIP).
 *
 * The file's metadata comes from Canvas by id, so Canvas decides what the student
 * may download. The Canvas token is sent only to the Canvas site; storage hosts
 * Canvas redirects to must be public https sites and never see the token.
 */
export type OpenedCanvasFile =
  | { ok: true; meta: CanvasFile; upstream: Response & { body: ReadableStream<Uint8Array> } }
  | { ok: false; status: number; error: string; details?: string };

export async function openCanvasFile(creds: CanvasCredentials, fileId: number | string): Promise<OpenedCanvasFile> {
  const metaRes = await canvasServerFetch(creds, `/files/${fileId}`);
  if (!metaRes.ok) {
    return { ok: false, status: metaRes.status, error: `Canvas API error: ${metaRes.status}`, details: (await metaRes.text()).slice(0, 500) };
  }
  const meta = (await metaRes.json()) as CanvasFile;
  if (!meta.url) {
    return { ok: false, status: 403, error: 'This file is locked or not available for download', details: meta.lock_explanation };
  }

  const canvasHost = new URL(creds.baseUrl).host;
  const fetchHop = async (url: URL) => {
    if (url.host === canvasHost) return canvasServerFetch(creds, url.toString(), { redirect: 'manual' });
    if (!(await isPublicHttpsUrl(url))) return null;
    return fetch(url.toString(), { redirect: 'manual', cache: 'no-store' });
  };

  let current = new URL(meta.url, creds.baseUrl);
  let upstream = await fetchHop(current);
  for (let hops = 0; upstream && hops < 5 && upstream.status >= 300 && upstream.status < 400; hops++) {
    const location = upstream.headers.get('location');
    if (!location) break;
    current = new URL(location, current);
    upstream = await fetchHop(current);
  }
  if (!upstream || !upstream.ok || !upstream.body) {
    return { ok: false, status: 502, error: `Could not download file (${upstream?.status ?? 'blocked host'})` };
  }
  return { ok: true, meta, upstream: upstream as Response & { body: ReadableStream<Uint8Array> } };
}
