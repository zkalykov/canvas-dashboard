import { NextRequest, NextResponse } from 'next/server';
import { requireCanvasSession } from '@/lib/canvas-server';
import { openCanvasFile } from '@/lib/canvas-files-server';
import { fileKind, inlineContentType } from '@/lib/files';

type RouteContext = { params: Promise<{ fileId: string }> };

/**
 * Streams a Canvas file to the browser.
 *   GET /api/files/:id            -> inline (only for safe types: images, PDF, audio, video, plain text)
 *   GET /api/files/:id?download=1 -> attachment
 * The Canvas token is only ever sent to Canvas itself, never to the storage host it redirects to.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { fileId } = await params;
  if (!/^\d+$/.test(fileId)) {
    return NextResponse.json({ error: 'Invalid file id' }, { status: 400 });
  }

  const session = await requireCanvasSession();
  if (session.error) return session.error;
  const { creds } = session;

  const opened = await openCanvasFile(creds, fileId);
  if (!opened.ok) {
    return NextResponse.json({ error: opened.error, details: opened.details }, { status: opened.status });
  }
  const { meta, upstream } = opened;

  const filename = meta.display_name || meta.filename || `file-${fileId}`;
  const kind = fileKind(meta['content-type'] || upstream.headers.get('content-type'), filename);
  const wantsDownload = request.nextUrl.searchParams.get('download') === '1';
  // Inline only for safe kinds, and then with a Content-Type from a fixed list.
  const inlineType = wantsDownload ? null : inlineContentType(kind, meta['content-type'] || upstream.headers.get('content-type'));
  const inline = inlineType !== null;
  const asciiName = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

  const headers = new Headers();
  headers.set('Content-Type', inlineType ?? 'application/octet-stream');
  // Nothing served here may run script (PDFs keep Chrome's viewer working without it).
  if (kind !== 'pdf') headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  headers.set(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'private, max-age=300');
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);

  return new NextResponse(upstream.body, { status: 200, headers });
}
