import { NextRequest, NextResponse } from 'next/server';
import { canvasServerFetch, isSameOriginRequest, requireCanvasSession } from '@/lib/canvas-server';
import { isPublicHttpsUrl } from '@/lib/public-address';

/**
 * Uploads one or more files for an assignment submission using Canvas's
 * 3-step file upload flow, entirely server-side:
 *   1. POST /courses/:c/assignments/:a/submissions/self/files  -> upload_url + upload_params
 *   2. POST multipart to upload_url (no Canvas token)
 *   3. Confirm via the returned Location (3XX or 201) with the Canvas token
 * Body: multipart form with courseId, assignmentId and one or more `file` fields.
 * Returns: { file_ids: number[] }
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-site request refused' }, { status: 403 });
  }
  const session = await requireCanvasSession();
  if (session.error) return session.error;
  const { creds } = session;

  if (creds.access === 'view') {
    return NextResponse.json({ error: 'This session is view only. Log in with full access to submit.' }, { status: 403 });
  }

  const form = await request.formData();
  const courseId = String(form.get('courseId') || '');
  const assignmentId = String(form.get('assignmentId') || '');
  if (!/^\d+$/.test(courseId) || !/^\d+$/.test(assignmentId)) {
    return NextResponse.json({ error: 'courseId and assignmentId are required' }, { status: 400 });
  }
  const files = form.getAll('file').filter((f): f is File => typeof f !== 'string');
  if (files.length === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const canvasHost = new URL(creds.baseUrl).host;
  const fileIds: number[] = [];

  for (const file of files) {
    // Step 1: reserve an upload slot.
    const slotRes = await canvasServerFetch(
      creds,
      `/courses/${courseId}/assignments/${assignmentId}/submissions/self/files`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, content_type: file.type || 'application/octet-stream' }),
      }
    );
    if (!slotRes.ok) {
      return NextResponse.json(
        { error: `Canvas refused the upload (${slotRes.status})`, details: (await slotRes.text()).slice(0, 1000) },
        { status: slotRes.status }
      );
    }
    const slot = (await slotRes.json()) as { upload_url: string; upload_params?: Record<string, string> };

    // Step 2: send the bytes to the storage host. The Canvas token must NOT be sent here.
    if (!(await isPublicHttpsUrl(new URL(slot.upload_url)))) {
      return NextResponse.json({ error: 'Canvas gave an upload address that is not allowed' }, { status: 502 });
    }
    const uploadForm = new FormData();
    for (const [key, value] of Object.entries(slot.upload_params ?? {})) uploadForm.append(key, String(value));
    uploadForm.append('file', file, file.name);
    const uploadRes = await fetch(slot.upload_url, { method: 'POST', body: uploadForm, redirect: 'manual', cache: 'no-store' });

    // Step 3: confirm and read back the Canvas file object.
    let fileJson: { id?: number } | null = null;
    const location = uploadRes.headers.get('location');
    if ((uploadRes.status >= 300 && uploadRes.status < 400) || (uploadRes.status === 201 && location)) {
      if (!location) {
        return NextResponse.json({ error: 'Upload succeeded but Canvas gave no confirmation URL' }, { status: 502 });
      }
      const confirmUrl = new URL(location, slot.upload_url);
      // The token goes only to the Canvas site itself (or Instructure's own hosts).
      const isCanvas = confirmUrl.protocol === 'https:' && (confirmUrl.host === canvasHost || confirmUrl.hostname.endsWith('.instructure.com'));
      if (!isCanvas && !(await isPublicHttpsUrl(confirmUrl))) {
        return NextResponse.json({ error: 'Canvas gave a confirmation address that is not allowed' }, { status: 502 });
      }
      const confirmRes = isCanvas
        ? await canvasServerFetch(creds, confirmUrl.toString())
        : await fetch(confirmUrl.toString(), { cache: 'no-store', redirect: 'manual' });
      if (!confirmRes.ok) {
        return NextResponse.json({ error: `Upload confirmation failed (${confirmRes.status})` }, { status: 502 });
      }
      fileJson = (await confirmRes.json()) as { id?: number };
    } else if (uploadRes.ok) {
      fileJson = (await uploadRes.json().catch(() => null)) as { id?: number } | null;
    } else {
      return NextResponse.json(
        { error: `File upload failed (${uploadRes.status})`, details: (await uploadRes.text()).slice(0, 1000) },
        { status: 502 }
      );
    }

    if (!fileJson || typeof fileJson.id !== 'number') {
      return NextResponse.json({ error: 'Upload finished but no file id was returned' }, { status: 502 });
    }
    fileIds.push(fileJson.id);
  }

  return NextResponse.json({ file_ids: fileIds });
}
