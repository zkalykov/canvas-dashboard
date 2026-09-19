'use client';

import { useId, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { ArrowCounterClockwiseIcon, CheckCircleIcon, CircleNotchIcon, CloudArrowUpIcon, FileIcon, LinkIcon, LockSimpleIcon, TextTIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ViewOnlyNote } from '@/components/shared/view-only-note';
import { useAuth } from '@/lib/auth-context';
import { canvasApi } from '@/lib/canvas-api';
import { formatFileSize } from '@/lib/files';
import { isSubmitted } from '@/lib/submission-status';
import type { Assignment, Submission } from '@/lib/types';
import { cn } from '@/lib/utils';
import { canvasErrorMessage, normalizeUrl, plainTextToHtml } from './assignment-utils';
import { refreshSubmissionCaches } from './refresh-caches';

type SubmissionTab = 'upload' | 'text' | 'url';

interface AssignmentSubmissionProps {
  assignment: Assignment;
  /** The student's current submission (from useMySubmission or assignment.submission). */
  submission?: Submission | null;
  /** Called after a successful submission; refetch assignment/submission data here. */
  onSubmitted?: () => Promise<unknown> | void;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** Upload / text entry / URL submission form for one assignment. */
export function AssignmentSubmission({ assignment, submission, onSubmitted }: AssignmentSubmissionProps) {
  const types = assignment.submission_types ?? [];
  const hasUpload = types.includes('online_upload');
  const hasText = types.includes('online_text_entry');
  const hasUrl = types.includes('online_url');
  const availableTabs: SubmissionTab[] = [
    ...(hasUpload ? (['upload'] as const) : []),
    ...(hasText ? (['text'] as const) : []),
    ...(hasUrl ? (['url'] as const) : []),
  ];

  const allowedExtensions = (assignment.allowed_extensions ?? [])
    .map(ext => ext.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);

  const alreadySubmitted = isSubmitted(submission) && !!submission?.submitted_at;
  const attemptsUsed = submission?.attempt ?? 0;
  const allowedAttempts =
    assignment.allowed_attempts !== undefined && assignment.allowed_attempts !== null && assignment.allowed_attempts > 0
      ? assignment.allowed_attempts
      : null;
  const attemptsLeft = allowedAttempts === null ? null : Math.max(0, allowedAttempts - attemptsUsed);

  const [tab, setTab] = useState<SubmissionTab>(availableTabs[0] ?? 'upload');
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'submitting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const ids = useId();
  const { isViewOnly } = useAuth();

  const busy = phase !== 'idle';

  if (availableTabs.length === 0) return null;

  if (assignment.locked_for_user) {
    return (
      <Card className="py-5">
        <CardContent className="flex items-start gap-3 text-sm">
          <LockSimpleIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">Submissions are closed</p>
            <p className="text-muted-foreground">This assignment is locked, so you can&apos;t submit to it right now.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (attemptsLeft === 0) {
    return (
      <Card className="py-5">
        <CardContent className="flex items-start gap-3 text-sm">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">No attempts left</p>
            <p className="text-muted-foreground">
              You&apos;ve used all {allowedAttempts} allowed attempt{allowedAttempts === 1 ? '' : 's'} for this assignment.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isViewOnly) {
    return <ViewOnlyNote>View only: submitting is turned off.</ViewOnlyNote>;
  }

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const accepted: File[] = [];
    const problems: string[] = [];
    for (const file of Array.from(list)) {
      const ext = extensionOf(file.name);
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
        problems.push(`${file.name}: .${ext || '?'} files aren't allowed here.`);
      } else if (file.size === 0) {
        problems.push(`${file.name}: the file is empty.`);
      } else {
        accepted.push(file);
      }
    }
    setRejected(problems);
    setError(null);
    setJustSubmitted(false);
    if (accepted.length > 0) {
      setFiles(prev => {
        const seen = new Set(prev.map(fileKey));
        return [...prev, ...accepted.filter(f => !seen.has(fileKey(f)))];
      });
    }
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) addFiles(event.dataTransfer.files);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setJustSubmitted(false);

    try {
      if (tab === 'upload') {
        if (files.length === 0) throw new Error('Choose at least one file to upload.');
        setPhase('uploading');
        const fileIds = await canvasApi.uploadSubmissionFiles(assignment.course_id, assignment.id, files);
        if (fileIds.length === 0) throw new Error('The upload finished but Canvas returned no files.');
        setPhase('submitting');
        await canvasApi.submitAssignment(assignment.course_id, assignment.id, {
          submission_type: 'online_upload',
          file_ids: fileIds,
        });
      } else if (tab === 'text') {
        if (!text.trim()) throw new Error('Write something before submitting.');
        setPhase('submitting');
        await canvasApi.submitAssignment(assignment.course_id, assignment.id, {
          submission_type: 'online_text_entry',
          body: plainTextToHtml(text),
        });
      } else {
        const normalized = normalizeUrl(url);
        if (!normalized) throw new Error('Enter a valid website address, like https://example.com.');
        setPhase('submitting');
        await canvasApi.submitAssignment(assignment.course_id, assignment.id, {
          submission_type: 'online_url',
          url: normalized,
        });
      }

      setFiles([]);
      setRejected([]);
      setText('');
      setUrl('');
      setExpanded(false);
      setJustSubmitted(true);
    } catch (err) {
      setError(canvasErrorMessage(err, 'Your submission could not be sent. Please try again.'));
      setPhase('idle');
      return;
    }

    void refreshSubmissionCaches(assignment.course_id);
    try {
      await onSubmitted?.();
    } catch {
      // The submission went through; a failed refetch only leaves stale data on screen.
    } finally {
      setPhase('idle');
    }
  };

  const attemptsNote =
    attemptsLeft !== null ? `${attemptsLeft} of ${allowedAttempts} attempt${allowedAttempts === 1 ? '' : 's'} left` : null;

  // Already submitted: keep the form tucked away behind a "Resubmit" button.
  if (alreadySubmitted && !expanded) {
    return (
      <Card className="py-5">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 text-sm">
            <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium">{justSubmitted ? 'Submission received!' : 'You can submit a new attempt'}</p>
              <p className="text-muted-foreground">
                {justSubmitted
                  ? 'Canvas has your work. It shows up under "Your submission".'
                  : 'Your latest attempt is what your instructor grades.'}
                {attemptsNote ? ` ${attemptsNote}.` : ''}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setExpanded(true);
              setJustSubmitted(false);
            }}
            className="shrink-0"
          >
            <ArrowCounterClockwiseIcon className="h-4 w-4" /> Resubmit
          </Button>
        </CardContent>
      </Card>
    );
  }

  const submitLabel =
    phase === 'uploading'
      ? `Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`
      : phase === 'submitting'
        ? 'Submitting…'
        : alreadySubmitted
          ? 'Resubmit'
          : 'Submit assignment';

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{alreadySubmitted ? 'Submit a new attempt' : 'Submit assignment'}</CardTitle>
        <CardDescription>
          {availableTabs.length > 1 ? 'Choose how you want to turn this in.' : 'Turn in your work below.'}
          {attemptsNote ? ` ${attemptsNote}.` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={value => setTab(value as SubmissionTab)} className="w-full">
          {availableTabs.length > 1 && (
            <TabsList className="mb-4 w-full">
              {hasUpload && (
                <TabsTrigger value="upload" disabled={busy}>
                  <CloudArrowUpIcon className="h-4 w-4" /> Upload
                </TabsTrigger>
              )}
              {hasText && (
                <TabsTrigger value="text" disabled={busy}>
                  <TextTIcon className="h-4 w-4" /> Text
                </TabsTrigger>
              )}
              {hasUrl && (
                <TabsTrigger value="url" disabled={busy}>
                  <LinkIcon className="h-4 w-4" /> URL
                </TabsTrigger>
              )}
            </TabsList>
          )}

          <form onSubmit={handleSubmit}>
            {hasUpload && (
              <TabsContent value="upload" className="space-y-3">
                <label
                  htmlFor={`${ids}-files`}
                  onDragOver={event => {
                    event.preventDefault();
                    if (!busy) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
                    dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:bg-muted/40',
                    busy && 'pointer-events-none opacity-60'
                  )}
                >
                  <CloudArrowUpIcon className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium">Drop files here or click to browse</span>
                  <span className="text-xs text-muted-foreground">
                    {allowedExtensions.length > 0
                      ? `Allowed: ${allowedExtensions.map(e => `.${e}`).join(', ')}`
                      : 'You can add several files'}
                  </span>
                </label>
                <input
                  id={`${ids}-files`}
                  type="file"
                  multiple
                  accept={allowedExtensions.length > 0 ? allowedExtensions.map(e => `.${e}`).join(',') : undefined}
                  onChange={onFileInput}
                  disabled={busy}
                  className="sr-only"
                />

                {rejected.length > 0 && (
                  <ul className="space-y-1 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {rejected.map(problem => (
                      <li key={problem} className="flex items-start gap-2">
                        <WarningCircleIcon className="mt-0.5 h-4 w-4 shrink-0" /> {problem}
                      </li>
                    ))}
                  </ul>
                )}

                {files.length > 0 && (
                  <div className="space-y-2">
                    <ul className="space-y-2">
                      {files.map(file => (
                        <li key={fileKey(file)} className="flex items-center gap-3 rounded-lg border p-2 pl-3">
                          <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy}
                            onClick={() => setFiles(prev => prev.filter(f => f !== file))}
                            aria-label={`Remove ${file.name}`}
                          >
                            <XIcon className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      {files.length} file{files.length === 1 ? '' : 's'} · {formatFileSize(totalSize)}
                    </p>
                  </div>
                )}
              </TabsContent>
            )}

            {hasText && (
              <TabsContent value="text" className="space-y-2">
                <Label htmlFor={`${ids}-text`} className="sr-only">
                  Submission text
                </Label>
                <textarea
                  id={`${ids}-text`}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Type your submission here…"
                  disabled={busy}
                  className="flex min-h-64 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                />
                <p className="text-xs text-muted-foreground">Blank lines start a new paragraph.</p>
              </TabsContent>
            )}

            {hasUrl && (
              <TabsContent value="url" className="space-y-2">
                <Label htmlFor={`${ids}-url`}>Website URL</Label>
                <Input
                  id={`${ids}-url`}
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  disabled={busy}
                />
              </TabsContent>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <WarningCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {justSubmitted && !alreadySubmitted && (
              <div className="mt-4 flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
                <CheckCircleIcon className="h-4 w-4 shrink-0" /> Submission received!
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {alreadySubmitted && (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setExpanded(false)}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={busy} className="sm:min-w-40">
                {busy && <CircleNotchIcon className="h-4 w-4 animate-spin" />}
                {submitLabel}
              </Button>
            </div>
          </form>
        </Tabs>
      </CardContent>
    </Card>
  );
}
