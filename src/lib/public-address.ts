import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Server-only: makes sure a host is on the public internet before the server
 * fetches from it (a Canvas site typed in for token login, or a file storage host
 * Canvas redirects to). Stops the server being used to reach internal addresses.
 */

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version !== 6) return true;
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (lower.startsWith('::ffff:')) return true; // hex form of a mapped IPv4 address
  return (
    lower === '::' ||
    lower === '::1' ||
    /^f[cd]/.test(lower) || // unique local
    /^fe[89ab]/.test(lower) || // link-local
    lower.startsWith('ff') // multicast
  );
}

/** True when every address the host resolves to is public. */
export async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return !isPrivateAddress(host);
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(entry => !isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}

/** For URLs the server is about to fetch without the Canvas token (file storage hosts). */
export async function isPublicHttpsUrl(url: URL): Promise<boolean> {
  return url.protocol === 'https:' && !url.username && !url.password && (await resolvesToPublicAddress(url.hostname));
}
