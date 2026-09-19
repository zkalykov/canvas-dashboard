'use client';

import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import useSWR from 'swr';
import { CheckIcon, CircleNotchIcon, PaperPlaneRightIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCourses } from '@/hooks/use-canvas';
import canvasApi from '@/lib/canvas-api';
import { cn } from '@/lib/utils';
import type { Recipient } from '@/lib/types';
import { errorMessage, revalidateConversationLists } from './inbox-utils';
import { PersonAvatar } from './participant-avatar';

interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: number | undefined;
  /** Called with the new conversation id (null if Canvas did not return one). */
  onSent: (conversationId: number | null) => void;
}

export function ComposeDialog({ open, onOpenChange, currentUserId, onSent }: ComposeDialogProps) {
  const [sending, setSending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={next => !sending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100%-2rem)] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>Send a message to people in one of your courses.</DialogDescription>
        </DialogHeader>
        {/* Rendered only while open, so the form starts empty every time. */}
        <ComposeForm
          currentUserId={currentUserId}
          sending={sending}
          setSending={setSending}
          onCancel={() => onOpenChange(false)}
          onSent={onSent}
        />
      </DialogContent>
    </Dialog>
  );
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Only individual people: context results ("All students", sections...) are left out. */
function isPerson(recipient: Recipient): boolean {
  return recipient.type !== 'context' && /^\d+$/.test(String(recipient.id));
}

function roleIn(recipient: Recipient, courseId: string): string | null {
  const roles = recipient.common_courses?.[courseId];
  if (!roles || roles.length === 0) return null;
  if (roles.some(r => r.includes('Teacher'))) return 'Teacher';
  if (roles.some(r => r === 'TaEnrollment')) return 'TA';
  if (roles.some(r => r.includes('Student'))) return 'Student';
  if (roles.some(r => r.includes('Observer'))) return 'Observer';
  if (roles.some(r => r.includes('Designer'))) return 'Designer';
  return null;
}

const fieldClass =
  'w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30';

function ComposeForm({
  currentUserId,
  sending,
  setSending,
  onCancel,
  onSent,
}: {
  currentUserId: number | undefined;
  sending: boolean;
  setSending: (sending: boolean) => void;
  onCancel: () => void;
  onSent: (conversationId: number | null) => void;
}) {
  const { data: courses, loading: coursesLoading, error: coursesError } = useCourses();
  const [courseId, setCourseId] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [term, setTerm] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const search = useDebouncedValue(term.trim(), 300);

  const context = courseId ? `course_${courseId}` : null;
  const {
    data: searchData,
    error: searchError,
    isLoading: searching,
  } = useSWR(
    context ? `inbox_recipient_search_${context}_${search}` : null,
    async () => ({ context: context!, results: await canvasApi.searchRecipients(search, context!) }),
    // Keep showing the previous matches while typing (but never another course's people).
    { revalidateOnFocus: false, dedupingInterval: 60000, errorRetryCount: 1, keepPreviousData: true }
  );
  const results = searchData?.context === context ? searchData.results : undefined;

  const sortedCourses = useMemo(
    () => [...(courses ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [courses]
  );

  const selectedIds = useMemo(() => new Set(recipients.map(r => String(r.id))), [recipients]);
  const people = useMemo(
    () => (results ?? []).filter(r => isPerson(r) && String(r.id) !== String(currentUserId)),
    [results, currentUserId]
  );

  const changeCourse = (value: string) => {
    setCourseId(value);
    setRecipients([]);
    setTerm('');
  };

  const toggleRecipient = (recipient: Recipient) => {
    const id = String(recipient.id);
    setRecipients(current =>
      current.some(r => String(r.id) === id) ? current.filter(r => String(r.id) !== id) : [...current, recipient]
    );
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && term === '' && recipients.length > 0) {
      setRecipients(current => current.slice(0, -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const first = people.find(p => !selectedIds.has(String(p.id)));
      if (first && term.trim()) {
        toggleRecipient(first);
        setTerm('');
      }
    }
  };

  const missing = !courseId
    ? 'Choose a course'
    : recipients.length === 0
      ? 'Add at least one recipient'
      : !body.trim()
        ? 'Write a message'
        : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (missing || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await canvasApi.createConversation({
        recipients: recipients.map(r => String(r.id)),
        subject: subject.trim() || undefined,
        body: body.trim(),
        context_code: `course_${courseId}`,
        group_conversation: recipients.length > 1,
      });
      void revalidateConversationLists();
      onSent(Array.isArray(created) && created[0]?.id ? created[0].id : null);
    } catch (err) {
      setError(errorMessage(err, "Your message wasn't sent. Please try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {/* Course */}
        <div className="space-y-1.5">
          <Label htmlFor="compose-course">Course</Label>
          {coursesLoading && !courses ? (
            <Skeleton className="h-9 w-full" />
          ) : coursesError && !courses ? (
            <p className="text-sm text-destructive">Couldn&apos;t load your courses. {errorMessage(coursesError)}</p>
          ) : (
            <select
              id="compose-course"
              value={courseId}
              onChange={event => changeCourse(event.target.value)}
              disabled={sending}
              className={cn(fieldClass, 'h-9')}
            >
              <option value="" disabled className="bg-background text-foreground">
                Select a course…
              </option>
              {sortedCourses.map(course => (
                <option key={course.id} value={String(course.id)} className="bg-background text-foreground">
                  {course.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Recipients */}
        <div className="space-y-1.5">
          <Label htmlFor="compose-to">To</Label>
          <div
            className={cn(
              'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input px-1.5 py-1 shadow-xs dark:bg-input/30',
              'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
              !courseId && 'opacity-50'
            )}
          >
            {recipients.map(recipient => (
              <span
                key={String(recipient.id)}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2 text-xs font-medium text-secondary-foreground"
              >
                <span className="truncate">{recipient.name}</span>
                <button
                  type="button"
                  onClick={() => toggleRecipient(recipient)}
                  disabled={sending}
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                  aria-label={`Remove ${recipient.name}`}
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              id="compose-to"
              value={term}
              onChange={event => setTerm(event.target.value)}
              onKeyDown={onSearchKeyDown}
              disabled={!courseId || sending}
              placeholder={courseId ? (recipients.length ? 'Add more people…' : 'Search people in this course…') : 'Choose a course first'}
              autoComplete="off"
              className="h-7 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
            />
          </div>

          {courseId && (
            <div className="max-h-52 overflow-y-auto rounded-md border" role="listbox" aria-label="People" aria-multiselectable>
              {searching && !results ? (
                <div className="space-y-1 p-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex items-center gap-2 p-1">
                      <Skeleton className="h-7 w-7 rounded-full" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  ))}
                </div>
              ) : searchError ? (
                <p className="flex items-center gap-2 p-3 text-sm text-destructive">
                  <WarningCircleIcon className="h-4 w-4 shrink-0" /> {errorMessage(searchError, "Couldn't search people.")}
                </p>
              ) : people.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  {search ? `No one matching “${search}” in this course.` : 'Start typing a name to find people.'}
                </p>
              ) : (
                <ul className="py-1">
                  {people.map(person => {
                    const selected = selectedIds.has(String(person.id));
                    const role = roleIn(person, courseId);
                    return (
                      <li key={String(person.id)}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => toggleRecipient(person)}
                          disabled={sending}
                          className={cn(
                            'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-muted',
                            selected && 'bg-muted/60'
                          )}
                        >
                          <PersonAvatar name={person.name} avatarUrl={person.avatar_url} className="size-7" />
                          <span className="min-w-0 flex-1 truncate">{person.name}</span>
                          {role && <span className="shrink-0 text-xs text-muted-foreground">{role}</span>}
                          <CheckIcon className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
                        </button>
                      </li>
                    );
                  })}
                  {searching && (
                    <li className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
                      <CircleNotchIcon className="h-3 w-3 animate-spin" /> Searching…
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
          {recipients.length > 1 && (
            <p className="text-xs text-muted-foreground">Everyone will be in one group conversation and see each other&apos;s replies.</p>
          )}
        </div>

        {/* Subject */}
        <div className="space-y-1.5">
          <Label htmlFor="compose-subject">Subject</Label>
          <Input
            id="compose-subject"
            value={subject}
            onChange={event => setSubject(event.target.value)}
            maxLength={255}
            disabled={sending}
            placeholder="(Optional)"
          />
        </div>

        {/* Body */}
        <div className="space-y-1.5">
          <Label htmlFor="compose-body">Message</Label>
          <textarea
            id="compose-body"
            value={body}
            onChange={event => setBody(event.target.value)}
            disabled={sending}
            rows={6}
            placeholder="Write your message…"
            className={cn(fieldClass, 'field-sizing-content max-h-72 min-h-32 resize-none py-2 placeholder:text-muted-foreground')}
          />
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <WarningCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-end">
        {missing && <p className="text-xs text-muted-foreground sm:mr-auto">{missing}</p>}
        <Button type="button" variant="outline" onClick={onCancel} disabled={sending}>
          Cancel
        </Button>
        <Button type="submit" disabled={Boolean(missing) || sending}>
          {sending ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <PaperPlaneRightIcon className="h-4 w-4" />}
          Send
        </Button>
      </div>
    </form>
  );
}
