import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// http(s):// or www. up to the next whitespace or quote/bracket character.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?*_~]+$/;

/** Drop punctuation that most likely ends the sentence rather than the URL, and unbalanced closing brackets. */
function trimUrl(raw: string): string {
  let url = raw.replace(TRAILING_PUNCTUATION, '');
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']] as const) {
    while (url.endsWith(close) && url.split(open).length < url.split(close).length) {
      url = url.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
    }
  }
  return url;
}

function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url.toLowerCase().startsWith('www.') ? `https://${url}` : url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * Renders plain text (Canvas conversation bodies) with line breaks preserved and
 * http(s) links made clickable. No HTML is ever interpreted.
 */
export function LinkifiedText({ text, className }: { text: string | null | undefined; className?: string }) {
  const value = text ?? '';
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const url = trimUrl(match[0]);
    const href = url ? safeHref(url) : null;
    if (!href) continue;
    if (start > cursor) parts.push(value.slice(cursor, start));
    parts.push(
      <a
        key={`${start}-${url}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="break-all text-blue-600 underline underline-offset-2 hover:opacity-80 dark:text-blue-400"
      >
        {url}
      </a>
    );
    cursor = start + url.length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));

  return <div className={cn('whitespace-pre-wrap break-words', className)}>{parts}</div>;
}
