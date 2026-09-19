import { NextRequest, NextResponse } from 'next/server';
import {
  canvasApiUrl,
  canvasServerFetch,
  isSameOriginRequest,
  requireCanvasSession,
  rewriteLinkHeader,
} from '@/lib/canvas-server';

type RouteContext = { params: Promise<{ path: string[] }> };

/**
 * Canvas endpoints this site never needs and no session may reach: they hand out a
 * full Canvas web login (login/session_token) or manage API tokens.
 */
const BLOCKED_PATHS = [/^\/login(\/|$)/, /^\/users\/[^/]+\/tokens(\/|$)/];

async function proxyRequest(request: NextRequest, { params }: RouteContext) {
  const { path } = await params;
  const method = request.method;
  if (path.some(segment => segment === '..' || segment === '.' || segment === '')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  // Canvas accepts a ".json" suffix; drop it so the path rules below always see the plain path.
  const segments = [...path];
  segments[segments.length - 1] = segments[segments.length - 1].replace(/\.json$/i, '');
  const endpoint = '/' + segments.map(encodeURIComponent).join('/');
  if (BLOCKED_PATHS.some(rule => rule.test(endpoint))) {
    return NextResponse.json({ error: 'Not available through this site' }, { status: 403 });
  }
  if (method !== 'GET' && method !== 'HEAD' && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-site request refused' }, { status: 403 });
  }

  const session = await requireCanvasSession();
  if (session.error) return session.error;
  const { creds } = session;

  // View-only sessions (approved as "View only" in Telegram) can read but never change anything.
  if (creds.access === 'view' && method !== 'GET' && method !== 'HEAD') {
    return NextResponse.json(
      { error: 'This session is view only. Log in with full access to submit or change things.' },
      { status: 403 }
    );
  }

  const query = new URLSearchParams(request.nextUrl.searchParams);
  // Reading a conversation normally marks it read in Canvas; a view-only session changes nothing.
  if (creds.access === 'view' && /^\/conversations\/\d+$/.test(endpoint)) query.set('auto_mark_as_read', 'false');
  const searchParams = query.toString();
  const url = canvasApiUrl(creds, endpoint, searchParams);

  const headers = new Headers();
  const contentType = request.headers.get('content-type') || '';
  const init: RequestInit = { method, headers };

  if (method !== 'GET' && method !== 'HEAD') {
    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      // Let fetch set the multipart boundary itself.
      init.body = await request.formData();
    } else {
      if (contentType) headers.set('Content-Type', contentType.includes('application/json') ? 'application/json' : contentType);
      const text = await request.text();
      if (text) init.body = text;
    }
  }

  try {
    const response = await canvasServerFetch(creds, url, init);

    if (response.status >= 300 && response.status < 400) {
      // Only redirects within the Canvas site are followed (see canvasServerFetch).
      return NextResponse.json({ error: 'Canvas redirected to another site' }, { status: 502 });
    }
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Canvas Proxy] ${method} ${endpoint} -> ${response.status}`);
      return NextResponse.json(
        { error: `Canvas API error: ${response.status}`, details: errorText.slice(0, 2000) },
        { status: response.status }
      );
    }

    const outHeaders = new Headers();
    const link = rewriteLinkHeader(response.headers.get('link'));
    if (link) outHeaders.set('Link', link);
    const cost = response.headers.get('x-request-cost');
    if (cost) outHeaders.set('X-Request-Cost', cost);

    if (response.status === 204) {
      return new NextResponse(null, { status: 204, headers: outHeaders });
    }

    const responseContentType = response.headers.get('content-type') || '';
    if (responseContentType.includes('application/json')) {
      const text = await response.text();
      // Canvas may prefix JSON with "while(1);" as CSRF protection.
      const cleaned = text.startsWith('while(1);') ? text.slice('while(1);'.length) : text;
      outHeaders.set('Content-Type', 'application/json; charset=utf-8');
      return new NextResponse(cleaned || 'null', { status: response.status, headers: outHeaders });
    }

    const text = await response.text();
    if (responseContentType) outHeaders.set('Content-Type', responseContentType);
    return new NextResponse(text, { status: response.status, headers: outHeaders });
  } catch (error) {
    console.error(`[Canvas Proxy] ${method} ${endpoint} failed:`, error);
    return NextResponse.json(
      { error: 'Failed to reach Canvas', details: String(error) },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}
