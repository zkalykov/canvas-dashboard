/**
 * Server-side app configuration read from environment variables.
 * See .env.example for what each variable does.
 */

const DEFAULT_PORTAL_URL = 'https://canvas.sonungo.com';

function flag(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

let warnedDevModeInProduction = false;

/**
 * DEV_MODE=1: skip login; every request uses CANVAS_BASE_URL + CANVAS_API_TOKEN
 * from the environment. Only works under `npm run dev` (ignored in production
 * builds), because anyone who can reach the server acts as that token's owner.
 */
export function isTestMode(): boolean {
  if (!flag(process.env.DEV_MODE)) return false;
  if (process.env.NODE_ENV === 'production') {
    if (!warnedDevModeInProduction) {
      warnedDevModeInProduction = true;
      console.warn('[Config] DEV_MODE is ignored in production builds; login is required.');
    }
    return false;
  }
  return true;
}

export function testModeCredentials(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.CANVAS_BASE_URL?.trim();
  const token = process.env.CANVAS_API_TOKEN?.trim();
  return baseUrl && token ? { baseUrl, token } : null;
}

/**
 * MANUAL_MODE=1: offer manual login on the login screen (paste a Canvas URL +
 * personal access token). Off unless explicitly set, in every environment.
 */
export function isManualLoginEnabled(): boolean {
  return flag(process.env.MANUAL_MODE) ?? false;
}

/** The portal (Telegram bot backend) that checks one-time login links and asks for approval. */
export function portalUrl(): string {
  return (process.env.PORTAL_URL?.trim() || DEFAULT_PORTAL_URL).replace(/\/+$/, '');
}

/**
 * Headers for every call to the portal. PORTAL_API_KEY (the same value set on the
 * portal) proves the call comes from this server.
 */
export function portalHeaders(): Record<string, string> {
  const key = process.env.PORTAL_API_KEY?.trim();
  return { 'Content-Type': 'application/json', ...(key ? { 'X-Portal-Key': key } : {}) };
}
