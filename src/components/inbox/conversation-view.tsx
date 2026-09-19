'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useSWRConfig } from 'swr';
import { ArchiveIcon, ArrowBendUpRightIcon, ArrowLeftIcon, CaretRightIcon, CircleNotchIcon, DownloadSimpleIcon, EnvelopeSimpleIcon, PaperPlaneRightIcon, PaperclipIcon, StarIcon, TrayArrowUpIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFilePreview, type PreviewableFile } from '@/components/files/file-preview-dialog';
import { ViewOnlyNote } from '@/components/shared/view-only-note';
import { useConversation, useCourseColors } from '@/hooks/use-canvas';
import { useAuth } from '@/lib/auth-context';
import canvasApi from '@/lib/canvas-api';
import { fileContentUrl, formatFileSize } from '@/lib/files';
import { cn } from '@/lib/utils';
import type {
  Attachment,
  Conversation,
  ConversationDetail,
  ConversationMessage,
  ConversationParticipant,
  User,
} from '@/lib/types';
import {
  courseIdFromContext,
  errorMessage,
  formatFullDate,
  otherParticipants,
  participantNames,
  revalidateConversationLists,
  syncAfterOpening,
  updateConversationState,
} from './inbox-utils';
import { LinkifiedText } from './linkified-text';
import { PersonAvatar } from './participant-avatar';

type PeopleById = Map<number, ConversationParticipant>;

interface ConversationViewProps {
  id: number;
  /** The row from the conversation list, used to paint the header while the full thread loads. */
  preview?: Conversation;
  currentUser?: User;
  /** Phone-only back button. */
  onBack: () => void;
  /** Called after the conversation is archived or marked unread (it leaves the reading pane). */
  onClose: () => void;
}

function byDate(a: ConversationMessage, b: ConversationMessage) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

export function ConversationView({ id, preview, currentUser, onBack, onClose }: ConversationViewProps) {
  const { data, loading, error, refetch } = useConversation(id);
  const { cache } = useSWRConfig();
  const { getColor } = useCourseColors();
  const { openPreview, previewDialog } = useFilePreview();
  const { isViewOnly } = useAuth();
  const [busy, setBusy] = useState<'star' | 'archive' | 'unread' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const syncedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Opening a conversation marks it read in Canvas: update the badge and lists once per open.
  useEffect(() => {
    if (!data || syncedRef.current) return;
    syncedRef.current = true;
    const sync = () => syncAfterOpening(id, cache.keys(), key => cache.get(key)?.data);
    // Canvas returns the conversation already marked read, so a cached "unread" copy means the
    // student marked it unread after we loaded it: fetch again so Canvas marks it read, then sync.
    if (data.workflow_state === 'unread') void refetch().then(sync, sync);
    else sync();
  }, [data, id, cache, refetch]);

  const conversation: Conversation | ConversationDetail | undefined = data ?? preview;

  const people: PeopleById = useMemo(() => {
    const map: PeopleById = new Map();
    for (const p of [...(preview?.participants ?? []), ...(data?.participants ?? [])]) {
      const known = map.get(p.id);
      map.set(p.id, { ...known, ...p, avatar_url: p.avatar_url || known?.avatar_url });
    }
    if (currentUser) {
      const known = map.get(currentUser.id);
      map.set(currentUser.id, {
        id: currentUser.id,
        name: known?.name || currentUser.short_name || currentUser.name,
        avatar_url: currentUser.avatar_url || known?.avatar_url,
      });
    }
    return map;
  }, [preview?.participants, data?.participants, currentUser]);

  const messages = useMemo(() => [...(data?.messages ?? [])].sort(byDate), [data?.messages]);

  // Keep the newest message in view when the thread loads or a reply arrives.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && messages.length > 0) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const runAction = async (
    kind: 'star' | 'archive' | 'unread',
    changes: Parameters<typeof updateConversationState>[1],
    closeAfter: boolean
  ) => {
    if (!conversation) return;
    setBusy(kind);
    setActionError(null);
    try {
      await updateConversationState(conversation, changes);
      if (closeAfter) onClose();
    } catch (err) {
      setActionError(errorMessage(err, "Couldn't update this conversation. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const sendReply = async (body: string) => {
    await canvasApi.replyToConversation(id, body);
    await refetch();
    void revalidateConversationLists();
  };

  const others = otherParticipants(conversation?.participants, currentUser?.id);
  const courseId = courseIdFromContext(conversation?.context_code);
  const archived = conversation?.workflow_state === 'archived';
  const cannotReply = Boolean((data as (ConversationDetail & { cannot_reply?: boolean }) | undefined)?.cannot_reply);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-start gap-2 border-b p-3 sm:px-4">
        <Button variant="ghost" size="icon" className="-ml-1 shrink-0 lg:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeftIcon className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1 py-1">
          {conversation ? (
            <>
              <h2 className="text-base leading-snug font-semibold break-words sm:text-lg">
                {conversation.subject || '(No subject)'}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {conversation.context_name && (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40"
                      style={courseId ? { backgroundColor: getColor(courseId) } : undefined}
                      aria-hidden
                    />
                    <span className="truncate">{conversation.context_name}</span>
                  </span>
                )}
                <span className="min-w-0 truncate" title={others.map(p => p.name).join(', ')}>
                  With {participantNames(others, 4)}
                </span>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          )}
        </div>
        {conversation && !isViewOnly && (
          <div className="flex shrink-0 items-center">
            <IconAction
              label={conversation.starred ? 'Unstar' : 'Star'}
              onClick={() => runAction('star', { starred: !conversation.starred }, false)}
              disabled={busy !== null}
              pressed={conversation.starred}
            >
              <StarIcon className={cn('h-4 w-4', conversation.starred && 'fill-amber-500 text-amber-500')} />
            </IconAction>
            <IconAction
              label={archived ? 'Move to inbox' : 'Archive'}
              onClick={() =>
                runAction('archive', { workflow_state: archived ? 'read' : 'archived' }, !archived)
              }
              disabled={busy !== null}
            >
              {busy === 'archive' ? (
                <CircleNotchIcon className="h-4 w-4 animate-spin" />
              ) : archived ? (
                <TrayArrowUpIcon className="h-4 w-4" />
              ) : (
                <ArchiveIcon className="h-4 w-4" />
              )}
            </IconAction>
            {!archived && (
              <IconAction
                label="Mark as unread"
                onClick={() => runAction('unread', { workflow_state: 'unread' }, true)}
                disabled={busy !== null}
              >
                {busy === 'unread' ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <EnvelopeSimpleIcon className="h-4 w-4" />}
              </IconAction>
            )}
          </div>
        )}
      </div>

      {actionError && (
        <div className="flex items-start gap-2 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <WarningCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {loading && !data ? (
          <MessagesSkeleton />
        ) : error && !data ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <WarningCircleIcon className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Couldn&apos;t open this conversation</p>
              <p className="text-xs text-muted-foreground">{errorMessage(error)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">There are no messages in this conversation.</p>
        ) : (
          <div className="space-y-3">
            {messages.map(message => (
              <MessageItem
                key={message.id}
                message={message}
                people={people}
                currentUserId={currentUser?.id}
                onPreview={openPreview}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reply */}
      {data &&
        (cannotReply ? (
          <p className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
            Replies are turned off for this conversation.
          </p>
        ) : isViewOnly ? (
          <div className="border-t p-3 sm:px-4">
            <ViewOnlyNote>View only: replying is turned off.</ViewOnlyNote>
          </div>
        ) : (
          <ReplyBox onSend={sendReply} />
        ))}

      {previewDialog}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={pressed}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function MessageItem({
  message,
  people,
  currentUserId,
  onPreview,
  nested = false,
}: {
  message: ConversationMessage;
  people: PeopleById;
  currentUserId: number | undefined;
  onPreview: (file: PreviewableFile) => void;
  nested?: boolean;
}) {
  if (message.generated) {
    return <p className="py-1 text-center text-xs text-muted-foreground italic">{message.body}</p>;
  }

  const author = people.get(message.author_id);
  const mine = currentUserId !== undefined && message.author_id === currentUserId;
  const name = author?.name || author?.full_name || 'Unknown user';

  return (
    <article
      className={cn(
        'rounded-lg border p-3 sm:p-4',
        nested ? 'bg-background' : mine ? 'border-primary/15 bg-muted/50' : 'bg-card'
      )}
    >
      <header className="mb-2 flex items-center gap-2.5">
        <PersonAvatar name={name} avatarUrl={author?.avatar_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {name}
            {mine && <span className="font-normal text-muted-foreground"> (you)</span>}
          </p>
        </div>
        <time
          dateTime={message.created_at}
          title={formatFullDate(message.created_at)}
          className="shrink-0 text-xs text-muted-foreground"
        >
          {formatShortDate(message.created_at)}
        </time>
      </header>

      <LinkifiedText text={message.body} className="text-sm leading-relaxed" />

      {message.attachments && message.attachments.length > 0 && (
        <AttachmentList attachments={message.attachments} onPreview={onPreview} />
      )}

      {message.forwarded_messages && message.forwarded_messages.length > 0 && (
        <ForwardedMessages
          messages={message.forwarded_messages}
          people={people}
          currentUserId={currentUserId}
          onPreview={onPreview}
        />
      )}
    </article>
  );
}

function formatShortDate(value: string) {
  const full = formatFullDate(value);
  // "Mon, Jan 5, 2026 · 3:04 PM" -> "Jan 5, 2026 · 3:04 PM"
  return full.replace(/^[A-Za-z]{3}, /, '');
}

function AttachmentList({
  attachments,
  onPreview,
}: {
  attachments: Attachment[];
  onPreview: (file: PreviewableFile) => void;
}) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {attachments.map(file => {
        const name = file.display_name || file.filename || 'Attachment';
        return (
          <li key={file.id} className="flex max-w-full min-w-0 items-center rounded-md border bg-background text-sm">
            <button
              type="button"
              onClick={() => onPreview(file)}
              className="flex min-w-0 items-center gap-2 rounded-l-md py-1.5 pr-1 pl-2.5 text-left hover:bg-muted"
              title={`Preview ${name}`}
            >
              <PaperclipIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{name}</span>
              {file.size ? (
                <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
              ) : null}
            </button>
            <a
              href={fileContentUrl(file.id, { download: true })}
              className="flex h-full shrink-0 items-center rounded-r-md border-l px-2 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Download ${name}`}
              title="Download"
            >
              <DownloadSimpleIcon className="h-3.5 w-3.5" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function ForwardedMessages({
  messages,
  people,
  currentUserId,
  onPreview,
}: {
  messages: ConversationMessage[];
  people: PeopleById;
  currentUserId: number | undefined;
  onPreview: (file: PreviewableFile) => void;
}) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(() => [...messages].sort(byDate), [messages]);

  return (
    <div className="mt-3 border-l-2 pl-3">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <CaretRightIcon className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
        <ArrowBendUpRightIcon className="h-3.5 w-3.5" />
        {open ? 'Hide' : 'Show'} {sorted.length === 1 ? 'forwarded message' : `${sorted.length} forwarded messages`}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {sorted.map(message => (
            <MessageItem
              key={message.id}
              message={message}
              people={people}
              currentUserId={currentUserId}
              onPreview={onPreview}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReplyBox({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = body.trim().length > 0 && !sending;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body.trim());
      setBody('');
    } catch (err) {
      setError(errorMessage(err, "Your reply wasn't sent. Please try again."));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form onSubmit={submit} className="border-t p-3 sm:px-4">
      <label htmlFor="inbox-reply" className="sr-only">
        Reply
      </label>
      <textarea
        id="inbox-reply"
        value={body}
        onChange={event => setBody(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Write a reply…"
        rows={2}
        disabled={sending}
        className="field-sizing-content max-h-48 min-h-16 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 md:text-sm dark:bg-input/30"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        {error ? (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
            <WarningCircleIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : (
          <p className="hidden text-xs text-muted-foreground sm:block">Ctrl/⌘ + Enter to send</p>
        )}
        <Button type="submit" size="sm" disabled={!canSend} className="ml-auto shrink-0">
          {sending ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <PaperPlaneRightIcon className="h-4 w-4" />}
          Send
        </Button>
      </div>
    </form>
  );
}

function MessagesSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading messages">
      {[0, 1, 2].map(i => (
        <div key={i} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          {i === 0 && <Skeleton className="h-4 w-2/3" />}
        </div>
      ))}
    </div>
  );
}
