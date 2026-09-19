'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlassIcon, StarIcon, TrayIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCourseColors } from '@/hooks/use-canvas';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/lib/types';
import {
  INBOX_SCOPES,
  courseIdFromContext,
  errorMessage,
  formatFullDate,
  formatListDate,
  otherParticipants,
  participantNames,
  updateConversationState,
  type InboxScope,
} from './inbox-utils';
import { ParticipantAvatars } from './participant-avatar';

const EMPTY_STATES: Record<InboxScope, { title: string; body: string }> = {
  inbox: { title: 'Your inbox is empty', body: 'Messages from your instructors and classmates will show up here.' },
  unread: { title: "You're all caught up", body: 'There are no unread conversations.' },
  starred: { title: 'No starred conversations', body: 'Star important conversations to find them here quickly.' },
  sent: { title: 'No sent messages', body: 'Conversations you start will show up here.' },
  archived: { title: 'Nothing archived', body: 'Archived conversations are kept here, out of your inbox.' },
};

interface ConversationListProps {
  scope: InboxScope;
  onScopeChange: (scope: InboxScope) => void;
  conversations: Conversation[] | undefined;
  loading: boolean;
  error: Error | undefined;
  onRetry: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  currentUserId: number | undefined;
  unreadCount: number;
}

export function ConversationList({
  scope,
  onScopeChange,
  conversations,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  currentUserId,
  unreadCount,
}: ConversationListProps) {
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const { getColor } = useCourseColors();
  const { isViewOnly } = useAuth();

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!conversations || !term) return conversations;
    return conversations.filter(c =>
      [c.subject, c.last_message, c.context_name, ...c.participants.map(p => p.name)]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(term))
    );
  }, [conversations, query]);

  const toggleStar = async (conversation: Conversation) => {
    setActionError(null);
    try {
      await updateConversationState(conversation, { starred: !conversation.starred });
    } catch (err) {
      setActionError(errorMessage(err, "Couldn't update the star. Please try again."));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b p-3">
        <Tabs value={scope} onValueChange={value => onScopeChange(value as InboxScope)}>
          <TabsList className="w-full justify-start overflow-x-auto [scrollbar-width:none]">
            {INBOX_SCOPES.map(item => (
              <TabsTrigger key={item.value} value={item.value} className="px-1.5 text-xs">
                {item.label}
                {item.value === 'unread' && unreadCount > 0 && (
                  <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold leading-4 text-white tabular-nums dark:bg-blue-500">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter by name, subject or course"
            aria-label="Filter conversations"
            className="h-8 pr-8 pl-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear filter"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="flex items-start gap-2 border-b bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <WarningCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss" className="shrink-0">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !conversations ? (
          <ListSkeleton />
        ) : error && !conversations ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <WarningCircleIcon className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Couldn&apos;t load conversations</p>
              <p className="text-xs text-muted-foreground">{errorMessage(error)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <TrayIcon className="h-8 w-8 text-muted-foreground" />
            {query.trim() ? (
              <p className="text-sm text-muted-foreground">No conversations match &ldquo;{query.trim()}&rdquo;.</p>
            ) : (
              <>
                <p className="text-sm font-medium">{EMPTY_STATES[scope].title}</p>
                <p className="text-xs text-muted-foreground">{EMPTY_STATES[scope].body}</p>
              </>
            )}
          </div>
        ) : (
          <ul>
            {filtered.map(conversation => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                scope={scope}
                selected={conversation.id === selectedId}
                currentUserId={currentUserId}
                courseColor={getColor}
                onSelect={onSelect}
                onToggleStar={isViewOnly ? undefined : toggleStar}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  scope,
  selected,
  currentUserId,
  courseColor,
  onSelect,
  onToggleStar,
}: {
  conversation: Conversation;
  scope: InboxScope;
  selected: boolean;
  currentUserId: number | undefined;
  courseColor: (courseId: number) => string;
  onSelect: (id: number) => void;
  /** Left out in view-only sessions: the star is shown but can't be changed. */
  onToggleStar?: (conversation: Conversation) => void;
}) {
  const people = otherParticipants(conversation.participants, currentUserId);
  const unread = conversation.workflow_state === 'unread';
  const courseId = courseIdFromContext(conversation.context_code);
  const date =
    scope === 'sent'
      ? conversation.last_authored_message_at || conversation.last_message_at
      : conversation.last_message_at || conversation.last_authored_message_at;

  return (
    <li className="relative border-b last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full gap-2.5 py-3 pr-3 pl-2 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
          selected && 'bg-muted hover:bg-muted'
        )}
      >
        <span
          className={cn(
            'mt-4 h-2 w-2 shrink-0 rounded-full',
            unread ? 'bg-blue-600 dark:bg-blue-500' : 'bg-transparent'
          )}
          aria-hidden
        />
        <ParticipantAvatars people={people} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>
              {unread && <span className="sr-only">Unread: </span>}
              {participantNames(people)}
            </span>
            {conversation.message_count > 1 && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{conversation.message_count}</span>
            )}
            <time
              dateTime={date ?? undefined}
              title={formatFullDate(date)}
              className={cn('shrink-0 text-xs', unread ? 'font-medium text-foreground' : 'text-muted-foreground')}
            >
              {formatListDate(date)}
            </time>
          </div>
          <p className={cn('truncate text-sm', unread ? 'font-semibold' : 'text-foreground/90')}>
            {conversation.subject || '(No subject)'}
          </p>
          {conversation.last_message && (
            <p className="line-clamp-2 pr-6 text-xs break-words text-muted-foreground">{conversation.last_message}</p>
          )}
          {conversation.context_name && (
            <div className="mt-1.5 flex items-center gap-1.5 pr-8 text-xs text-muted-foreground">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40"
                style={courseId ? { backgroundColor: courseColor(courseId) } : undefined}
                aria-hidden
              />
              <span className="truncate">{conversation.context_name}</span>
            </div>
          )}
        </div>
      </button>
      {onToggleStar ? (
        <button
          type="button"
          onClick={() => onToggleStar(conversation)}
          aria-pressed={conversation.starred}
          aria-label={conversation.starred ? 'Unstar conversation' : 'Star conversation'}
          className={cn(
            'absolute right-2 bottom-2 rounded-md p-1.5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
            conversation.starred ? 'text-amber-500' : 'text-muted-foreground/60 hover:text-foreground'
          )}
        >
          <StarIcon className={cn('h-4 w-4', conversation.starred && 'fill-current')} />
        </button>
      ) : (
        conversation.starred && (
          <span className="pointer-events-none absolute right-2 bottom-2 p-1.5 text-amber-500">
            <StarIcon className="h-4 w-4 fill-current" aria-hidden />
            <span className="sr-only">Starred</span>
          </span>
        )
      )}
    </li>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex gap-3 border-b px-4 py-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
