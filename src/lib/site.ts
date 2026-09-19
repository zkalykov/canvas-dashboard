/**
 * Public facts about the site, used by the landing page, page metadata, the
 * sitemap and robots.txt.
 */
export const SITE_NAME = 'Canvas Dashboard';
export const SITE_TITLE = 'Canvas Dashboard: a simple Canvas LMS dashboard for students';
export const SITE_DESCRIPTION =
  'A free, open-source dashboard for Canvas LMS. See assignments, due dates, grades, files and messages from every course in one place. Log in with Telegram, view only or full access.';
export const GITHUB_URL = 'https://github.com/zkalykov/canvas-dashboard';

/** The public address of this site (SITE_URL, else Vercel's production domain, else the default). */
export function siteUrl(): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return 'https://canvas-dashboard.sonungo.com';
}
