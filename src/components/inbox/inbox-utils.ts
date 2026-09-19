import { mutate } from 'swr';
import { differenceInCalendarDays, format, isSameYear, isToday, isYesterday } from 'date-fns';
import canvasApi, { CanvasApiError } from '@/lib/canvas-api';
import type { Conversation, ConversationDetail, ConversationParticipant } from '@/lib/types';

export type InboxScope = 'inbox' | 'unread' | 'starred' | 'sent' | 'archived';

export const INBOX_SCOPES: { value: InboxScope; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'unread', label: 'Unread' },
  { value: 'starred', label: 'Starred' },
  { value: 'sent', label: 'Sent' },
  { value: 'archived', label: 'Archived' },
];

// SWR keys used by the hooks in src/hooks/use-canvas.ts
const LIST_KEY_PREFIX = 'canvas_conversations_';
const UNREAD_COUNT_KEY = 'canvas_unread_count';
const detailKey = (id: number) => `canvas_conversation_${id}`;
const isListKey = (key: unknown): boolean => typeof key === 'string' && key.startsWith(LIST_KEY_PREFIX);
const scopeOfListKey = (key: string) => key.slice(LIST_KEY_PREFIX.length) as InboxScope;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Email-style date for list rows: time today, "Yesterday", weekday this week, then a date. */
export function formatListDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  const days = differenceInCalendarDays(new Date(), date);
  if (days > 0 && days < 7) return format(date, 'EEEE');
  if (isSameYear(date, new Date())) return format(date, 'MMM d');
  return format(date, 'MMM d, yyyy');
}

export function formatFullDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format(date, 'EEE, MMM d, yyyy · h:mm a');
}

export function initials(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

export { usableAvatar } from '@/lib/avatar';

/** "course_123" -> 123 (null for groups and anything else). */
export function courseIdFromContext(contextCode: string | null | undefined): number | null {
  const match = contextCode?.match(/^course_(\d+)$/);
  return match ? Number(match[1]) : null;
}

/** Everyone in the conversation except the signed-in student (falls back to everyone for notes-to-self). */
export function otherParticipants(
  participants: ConversationParticipant[] | undefined,
  currentUserId: number | undefined
): ConversationParticipant[] {
  const all = participants ?? [];
  const others = currentUserId ? all.filter(p => p.id !== currentUserId) : all;
  return others.length > 0 ? others : all;
}

export function participantNames(people: ConversationParticipant[], max = 3): string {
  if (people.length === 0) return 'No participants';
  const names = people.slice(0, max).map(p => p.name || p.full_name || 'Unknown');
  const extra = people.length - max;
  return extra > 0 ? `${names.join(', ')} +${extra}` : names.join(', ');
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof CanvasApiError) {
    if (error.status === 401) return 'Your session has expired. Please sign in again.';
    if (error.status === 403) return "You don't have permission to do that in Canvas.";
    if (error.status === 404) return "Canvas couldn't find it. It may have been deleted, or you no longer have access.";
    return error.details || error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// SWR cache helpers
// ---------------------------------------------------------------------------

/** Refetch mounted conversation lists and invalidate the cached ones for other scopes. */
export function revalidateConversationLists() {
  return mutate(isListKey);
}

export function revalidateUnreadCount() {
  return mutate(UNREAD_COUNT_KEY);
}

/** Whether a conversation still belongs in a scope after a local change (unread/sent are left to the next refetch). */
function belongsInScope(scope: InboxScope, conversation: Conversation): boolean {
  switch (scope) {
    case 'inbox':
      return conversation.workflow_state !== 'archived';
    case 'archived':
      return conversation.workflow_state === 'archived';
    case 'starred':
      return conversation.starred;
    default:
      return true;
  }
}

type ConversationChanges = { workflow_state?: 'read' | 'unread' | 'archived'; starred?: boolean };

/** Apply a change to a conversation everywhere it is cached, without refetching. */
function patchConversation(id: number, changes: ConversationChanges) {
  for (const { value: scope } of INBOX_SCOPES) {
    void mutate<Conversation[]>(
      `${LIST_KEY_PREFIX}${scope}`,
      list => {
        if (!list) return list;
        return list
          .map(c => (c.id === id ? { ...c, ...changes } : c))
          .filter(c => c.id !== id || belongsInScope(scope, c));
      },
      { revalidate: false }
    );
  }
  void mutate<ConversationDetail>(detailKey(id), detail => (detail ? { ...detail, ...changes } : detail), {
    revalidate: false,
  });
}

/**
 * Star/archive/mark-unread with an optimistic update. Reverts on failure and re-syncs the
 * lists (and the unread badge) with Canvas afterwards either way.
 */
export async function updateConversationState(conversation: Conversation, changes: ConversationChanges) {
  const previous: ConversationChanges = {
    workflow_state: conversation.workflow_state,
    starred: conversation.starred,
  };
  patchConversation(conversation.id, changes);
  try {
    await canvasApi.updateConversation(conversation.id, changes);
  } catch (error) {
    patchConversation(conversation.id, previous);
    throw error;
  } finally {
    void revalidateConversationLists();
    if (changes.workflow_state) void revalidateUnreadCount();
  }
}

/**
 * Canvas marks a conversation read when it is opened. Reflect that locally, refresh the unread
 * badge, and refetch the lists when the conversation was unread (so the Unread tab stays honest).
 */
export function syncAfterOpening(id: number, cachedKeys: Iterable<string>, readCache: (key: string) => unknown) {
  let wasUnread = false;
  for (const key of cachedKeys) {
    if (!isListKey(key) || scopeOfListKey(key) === 'archived') continue;
    const list = readCache(key);
    if (Array.isArray(list) && (list as Conversation[]).some(c => c.id === id && c.workflow_state === 'unread')) {
      wasUnread = true;
    }
  }

  void revalidateUnreadCount();
  if (!wasUnread) return;

  void mutate<Conversation[]>(
    isListKey,
    list => list?.map(c => (c.id === id && c.workflow_state === 'unread' ? { ...c, workflow_state: 'read' as const } : c)),
    { revalidate: false }
  ).then(() => revalidateConversationLists());
}
