import type { NextRequest } from 'next/server';

/**
 * Server-only: where a login request comes from, for the Telegram approval message.
 * Uses hosting headers when present (Vercel, Cloudflare), otherwise an IP lookup on
 * ipapi.co (set LOCATION_LOOKUP=0 to turn that off). Always best-effort.
 */

export function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || null;
}

export function isPrivateIp(ip: string) {
  return (
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === '::1' ||
    /^f[cd][0-9a-f]{2}:/i.test(ip) ||
    /^fe80:/i.test(ip) ||
    ip.startsWith('::ffff:127.')
  );
}

const header = (request: NextRequest, name: string) => {
  const value = request.headers.get(name);
  return value ? decodeURIComponent(value) : '';
};

export async function describeLocation(request: NextRequest): Promise<string> {
  const city = header(request, 'x-vercel-ip-city');
  const region = header(request, 'x-vercel-ip-country-region');
  const country = header(request, 'x-vercel-ip-country') || header(request, 'cf-ipcountry');
  if (city || country) return [city, region, country].filter(Boolean).join(', ');

  if (process.env.LOCATION_LOOKUP?.trim() === '0') return '';
  const ip = clientIp(request);
  if (!ip || isPrivateIp(ip)) return '';
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    });
    if (!res.ok) return '';
    const data = (await res.json()) as { city?: string; region?: string; country_name?: string; error?: boolean };
    if (data.error) return '';
    return [data.city, data.region, data.country_name].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

/** The client's public IP for the approval message, or '' for local/private addresses. */
export function publicClientIp(request: NextRequest): string {
  const ip = clientIp(request);
  return ip && !isPrivateIp(ip) ? ip : '';
}
