import { NextResponse } from 'next/server';
import { requireCanvasSession } from '@/lib/canvas-server';

/**
 * The page reports that someone is using it (clicks, typing, scrolling) even when
 * nothing new is loaded. The proxy (src/proxy.ts) then extends the session for another
 * hour, and the Telegram session is marked as used. 401 when the session is gone.
 */
export async function POST() {
  const session = await requireCanvasSession();
  return session.error ?? new NextResponse(null, { status: 204 });
}
