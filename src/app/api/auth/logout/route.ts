import { NextResponse } from 'next/server';
import { endCanvasSession } from '@/lib/canvas-server';

/** Logs out here and ends the session in Telegram's /sessions list too. */
export async function POST() {
  await endCanvasSession();
  return NextResponse.json({ success: true });
}
