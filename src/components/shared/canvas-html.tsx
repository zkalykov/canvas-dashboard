'use client';

import { useCallback, useMemo, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useFilePreview } from '@/components/files/file-preview-dialog';
import { cn } from '@/lib/utils';

/**
 * Renders HTML that came from Canvas (descriptions, pages, messages, posts).
 * - Canvas file links open in the in-app preview dialog.
 * - Links to Canvas assignments, pages, discussions and quizzes stay inside this app.
 * - Other links open in a new tab.
 */
export function CanvasHtml({ html, className }: { html: string | null | undefined; className?: string }) {
  const router = useRouter();
  const { canvasUrl } = useAuth();
  const { openPreview, previewDialog } = useFilePreview();

  const onClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;

      let url: URL;
      try {
        url = new URL(href, canvasUrl ? (canvasUrl.startsWith('http') ? canvasUrl : `https://${canvasUrl}`) : window.location.origin);
      } catch {
        return;
      }
      const canvasHost = canvasUrl ? new URL(canvasUrl.startsWith('http') ? canvasUrl : `https://${canvasUrl}`).host : null;
      const isCanvasLink = url.host === canvasHost || href.startsWith('/');

      if (isCanvasLink) {
        const path = url.pathname;
        const file = path.match(/^(?:\/(?:courses|users|groups)\/\d+)?\/files\/(\d+)/);
        if (file) {
          event.preventDefault();
          openPreview({ id: Number(file[1]), display_name: anchor.getAttribute('title') || anchor.textContent?.trim() || undefined });
          return;
        }
        const routes: [RegExp, (m: RegExpMatchArray) => string][] = [
          [/^\/courses\/(\d+)\/assignments\/(\d+)/, m => `/courses/${m[1]}/assignments/${m[2]}`],
          [/^\/courses\/(\d+)\/discussion_topics\/(\d+)/, m => `/courses/${m[1]}/discussions/${m[2]}`],
          [/^\/courses\/(\d+)\/announcements\/(\d+)/, m => `/courses/${m[1]}/discussions/${m[2]}`],
          [/^\/courses\/(\d+)\/pages\/([^/?#]+)/, m => `/courses/${m[1]}/pages/${m[2]}`],
          [/^\/courses\/(\d+)\/quizzes\/(\d+)/, m => `/courses/${m[1]}/quizzes/${m[2]}`],
          [/^\/courses\/(\d+)\/?$/, m => `/courses/${m[1]}`],
        ];
        for (const [pattern, target] of routes) {
          const match = path.match(pattern);
          if (match) {
            event.preventDefault();
            router.push(target(match));
            return;
          }
        }
      }

      if (url.origin !== window.location.origin) {
        event.preventDefault();
        window.open(url.toString(), '_blank', 'noopener,noreferrer');
      }
    },
    [canvasUrl, openPreview, router]
  );

  // Canvas embeds images/media as links to its own site, which only load when the browser
  // is logged into Canvas. Point them at our file endpoint, which uses the stored token.
  const rendered = useMemo(
    () =>
      html?.replace(
        /(<(?:img|video|audio|source)\b[^>]*?\ssrc=")([^"]*?\/files\/(\d+)(?:\/(?:preview|download))?(?:\?[^"]*)?)"/gi,
        (_match, before: string, _url: string, id: string) => `${before}/api/files/${id}"`
      ) ?? '',
    [html]
  );

  if (!html) return null;

  return (
    <>
      <div
        className={cn('canvas-html break-words', className)}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
      {previewDialog}
    </>
  );
}
