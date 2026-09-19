'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChatsIcon, NotePencilIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useConversations, useUnreadConversationCount, useUser } from '@/hooks/use-canvas';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { ComposeDialog } from './compose-dialog';
import { ConversationList } from './conversation-list';
import { ConversationView } from './conversation-view';
import type { InboxScope } from './inbox-utils';

// Header is h-16 and <main> has p-4 (md:p-6), so the panes fill exactly what is left of the viewport.
const SHELL = 'flex h-[calc(100dvh-6rem)] min-h-[32rem] flex-col gap-4 md:h-[calc(100dvh-7rem)]';

function parseConversationId(value: string | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function InboxPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = parseConversationId(searchParams.get('c'));

  const [scope, setScope] = useState<InboxScope>('inbox');
  const [composeOpen, setComposeOpen] = useState(false);

  const { isViewOnly } = useAuth();
  const { data: user } = useUser();
  const { data: conversations, loading, error, refetch } = useConversations(scope);
  const { count: unreadCount } = useUnreadConversationCount();

  const select = useCallback(
    (id: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set('c', String(id));
      else params.delete('c');
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const preview = selectedId ? conversations?.find(c => c.id === selectedId) : undefined;

  return (
    <div className={SHELL}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          Inbox
        </h1>
        {!isViewOnly && (
          <Button onClick={() => setComposeOpen(true)} aria-label="New message">
            <NotePencilIcon className="h-4 w-4" />
            <span className="hidden sm:inline">New message</span>
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* List pane: always visible on large screens, hidden on small screens while reading. */}
        <Card
          className={cn(
            'min-h-0 w-full gap-0 overflow-hidden py-0 lg:flex lg:w-80 lg:shrink-0 xl:w-96',
            selectedId ? 'hidden' : 'flex'
          )}
        >
          <ConversationList
            scope={scope}
            onScopeChange={setScope}
            conversations={conversations}
            loading={loading}
            error={error}
            onRetry={() => void refetch()}
            selectedId={selectedId}
            onSelect={select}
            currentUserId={user?.id}
            unreadCount={unreadCount}
          />
        </Card>

        {/* Reading pane */}
        <Card
          className={cn(
            'min-h-0 min-w-0 flex-1 gap-0 overflow-hidden py-0 lg:flex',
            selectedId ? 'flex' : 'hidden'
          )}
        >
          {selectedId ? (
            <ConversationView
              key={selectedId}
              id={selectedId}
              preview={preview}
              currentUser={user}
              onBack={() => select(null)}
              onClose={() => select(null)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <ChatsIcon className="h-10 w-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">Select a conversation</p>
                <p className="text-sm text-muted-foreground">Choose a message from the list to read it here.</p>
              </div>
              {!isViewOnly && (
                <Button variant="outline" size="sm" onClick={() => setComposeOpen(true)}>
                  <NotePencilIcon className="h-4 w-4" />
                  New message
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      {!isViewOnly && (
        <ComposeDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          currentUserId={user?.id}
          onSent={id => {
            setComposeOpen(false);
            // A conversation the student just started lives under Sent until someone replies.
            setScope('sent');
            if (id) select(id);
          }}
        />
      )}
    </div>
  );
}

/** Suspense fallback for the /inbox route (useSearchParams needs a boundary). */
export function InboxPageSkeleton() {
  return (
    <div className={SHELL}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
        <Skeleton className="h-full w-full rounded-xl lg:w-80 xl:w-96" />
        <Skeleton className="hidden h-full flex-1 rounded-xl lg:block" />
      </div>
    </div>
  );
}
