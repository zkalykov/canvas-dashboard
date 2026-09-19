'use client';

import type { ReactNode } from 'react';
import { ArrowSquareOutIcon, CheckCircleIcon, InfoIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CanvasHtml } from '@/components/shared/canvas-html';
import { htmlToPlainText, plainTextToHtml, formatPoints } from '@/components/assignments/assignment-utils';
import type { QuizSubmissionQuestion } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface MatchPair {
  answer_id: number;
  match_id: number;
}

/**
 * Local answer state per question type:
 * choice (MC/TF) -> number | null; multiple answers -> number[];
 * short answer / essay / numerical -> string (converted when saving); matching -> MatchPair[].
 */
export type AnswerValue = number | number[] | string | MatchPair[] | null;

const SUPPORTED_TYPES = new Set([
  'multiple_choice_question',
  'true_false_question',
  'multiple_answers_question',
  'short_answer_question',
  'essay_question',
  'numerical_question',
  'matching_question',
]);

export const isInfoOnly = (q: QuizSubmissionQuestion) => q.question_type === 'text_only_question';
export const isSupported = (q: QuizSubmissionQuestion) => SUPPORTED_TYPES.has(q.question_type);

const TYPE_NAMES: Record<string, string> = {
  multiple_dropdowns_question: 'Multiple dropdowns',
  fill_in_multiple_blanks_question: 'Fill in multiple blanks',
  file_upload_question: 'File upload',
  calculated_question: 'Formula',
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Turns the saved answer Canvas sends back into local form state. */
export function initialAnswer(q: QuizSubmissionQuestion): AnswerValue {
  const saved = q.answer;
  switch (q.question_type) {
    case 'multiple_choice_question':
    case 'true_false_question':
      return toNumber(saved);
    case 'multiple_answers_question':
      return Array.isArray(saved) ? saved.map(toNumber).filter((n): n is number => n !== null) : [];
    case 'short_answer_question':
      return typeof saved === 'string' ? saved : '';
    case 'essay_question':
      return typeof saved === 'string' && saved ? htmlToPlainText(saved) : '';
    case 'numerical_question':
      return saved === null || saved === undefined ? '' : String(saved);
    case 'matching_question':
      if (!Array.isArray(saved)) return [];
      return saved
        .map(item => {
          const pair = item as { answer_id?: unknown; match_id?: unknown };
          const answerId = toNumber(pair?.answer_id);
          const matchId = toNumber(pair?.match_id);
          return answerId !== null && matchId !== null ? { answer_id: answerId, match_id: matchId } : null;
        })
        .filter((p): p is MatchPair => p !== null);
    default:
      return null;
  }
}

/** Local form state -> the `answer` value the Canvas quiz_submission_questions API expects. */
export function toApiAnswer(q: QuizSubmissionQuestion, value: AnswerValue): unknown {
  switch (q.question_type) {
    case 'essay_question':
      return typeof value === 'string' && value.trim() ? plainTextToHtml(value) : '';
    case 'numerical_question':
      return typeof value === 'string' && value.trim() !== '' ? toNumber(value.trim()) : null;
    case 'multiple_answers_question':
    case 'matching_question':
      return Array.isArray(value) ? value : [];
    default:
      return value;
  }
}

function hasSavedAnswer(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(v => v !== null && v !== '');
  return true;
}

export function isAnswered(q: QuizSubmissionQuestion, value: AnswerValue): boolean {
  if (isInfoOnly(q)) return true;
  if (!isSupported(q)) return hasSavedAnswer(q.answer);
  switch (q.question_type) {
    case 'multiple_choice_question':
    case 'true_false_question':
      return typeof value === 'number';
    case 'multiple_answers_question':
      return Array.isArray(value) && value.length > 0;
    case 'matching_question':
      return Array.isArray(value) && (q.answers?.length ?? 0) > 0 && value.length >= (q.answers?.length ?? 0);
    case 'numerical_question':
      return typeof value === 'string' && value.trim() !== '' && toNumber(value.trim()) !== null;
    default:
      return typeof value === 'string' && value.trim() !== '';
  }
}

const textareaClass =
  'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 dark:bg-input/30';

function AnswerText({ html, text }: { html?: string; text: string }) {
  if (html && html.trim()) return <CanvasHtml html={html} className="text-sm" />;
  return <span className="text-sm">{text}</span>;
}

export function QuizQuestionCard({
  question,
  number,
  value,
  onChange,
  quizUrl,
  disabled,
}: {
  question: QuizSubmissionQuestion;
  /** Display number; null for text-only blocks. */
  number: number | null;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  quizUrl: string;
  disabled?: boolean;
}) {
  const q = question;
  const answers = q.answers ?? [];
  const inputId = (suffix: string | number) => `q${q.id}-${suffix}`;

  if (isInfoOnly(q)) {
    return (
      <Card className="gap-3 border-dashed bg-muted/20 py-4">
        <CardContent className="flex gap-3">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <CanvasHtml html={q.question_text} className="min-w-0 flex-1 text-sm leading-relaxed" />
        </CardContent>
      </Card>
    );
  }

  const answered = isAnswered(q, value);
  let body: ReactNode;

  switch (q.question_type) {
    case 'multiple_choice_question':
    case 'true_false_question':
      body = (
        <RadioGroup
          value={typeof value === 'number' ? String(value) : ''}
          onValueChange={v => onChange(Number(v))}
          disabled={disabled}
          className="gap-2"
          aria-label={`Question ${number ?? ''} answers`}
        >
          {answers.map(a => (
            <label
              key={a.id}
              htmlFor={inputId(a.id)}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50',
                value === a.id && 'border-primary bg-primary/5'
              )}
            >
              <RadioGroupItem value={String(a.id)} id={inputId(a.id)} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <AnswerText html={a.html} text={a.text} />
              </span>
            </label>
          ))}
        </RadioGroup>
      );
      break;

    case 'multiple_answers_question': {
      const selected = Array.isArray(value) ? (value as number[]) : [];
      body = (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Select all that apply.</p>
          {answers.map(a => {
            const checked = selected.includes(a.id);
            return (
              <label
                key={a.id}
                htmlFor={inputId(a.id)}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50',
                  checked && 'border-primary bg-primary/5'
                )}
              >
                <Checkbox
                  id={inputId(a.id)}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={next =>
                    onChange(next === true ? [...selected, a.id] : selected.filter(id => id !== a.id))
                  }
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <AnswerText html={a.html} text={a.text} />
                </span>
              </label>
            );
          })}
        </div>
      );
      break;
    }

    case 'short_answer_question':
      body = (
        <Input
          aria-label="Your answer"
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          placeholder="Your answer"
          disabled={disabled}
        />
      );
      break;

    case 'essay_question':
      body = (
        <textarea
          aria-label="Your answer"
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          placeholder="Write your answer…"
          rows={8}
          disabled={disabled}
          className={cn(textareaClass, 'min-h-40')}
        />
      );
      break;

    case 'numerical_question': {
      const raw = typeof value === 'string' ? value : '';
      const invalid = raw.trim() !== '' && toNumber(raw.trim()) === null;
      body = (
        <div className="max-w-xs space-y-1">
          <Input
            aria-label="Your answer (a number)"
            type="text"
            inputMode="decimal"
            value={raw}
            onChange={e => onChange(e.target.value)}
            placeholder="Enter a number"
            disabled={disabled}
            aria-invalid={invalid}
          />
          {invalid && <p className="text-xs text-destructive">Enter a number, like 42 or 3.14.</p>}
        </div>
      );
      break;
    }

    case 'matching_question': {
      const pairs = Array.isArray(value) ? (value as MatchPair[]) : [];
      const matches = q.matches ?? [];
      body = (
        <div className="space-y-3">
          {answers.map(a => {
            const current = pairs.find(p => p.answer_id === a.id);
            return (
              <div key={a.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 sm:items-center">
                <label htmlFor={inputId(`match-${a.id}`)} className="min-w-0 text-sm font-medium">
                  <AnswerText html={a.html} text={a.text} />
                </label>
                <select
                  id={inputId(`match-${a.id}`)}
                  value={current ? String(current.match_id) : ''}
                  disabled={disabled}
                  onChange={e => {
                    const rest = pairs.filter(p => p.answer_id !== a.id);
                    onChange(e.target.value ? [...rest, { answer_id: a.id, match_id: Number(e.target.value) }] : rest);
                  }}
                  className={selectClass}
                >
                  <option value="">Choose a match…</option>
                  {matches.map(m => (
                    <option key={m.match_id} value={String(m.match_id)}>
                      {m.text}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      );
      break;
    }

    default:
      body = (
        <div className="flex flex-col gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between dark:text-amber-300">
          <p>
            {TYPE_NAMES[q.question_type] ?? 'This'} questions can&apos;t be answered here yet. Answer this one in Canvas
            before you submit; answers you save here carry over.
          </p>
          <a
            href={quizUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 font-medium underline-offset-4 hover:underline"
          >
            Open in Canvas <ArrowSquareOutIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      );
  }

  return (
    <Card id={`question-${q.id}`} className="scroll-mt-24 gap-4">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            {answered ? (
              <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" aria-label="Answered" />
            ) : (
              <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" aria-label="Not answered" />
            )}
            Question {number}
          </span>
          {q.points_possible !== undefined && q.points_possible !== null && (
            <Badge variant="outline" className="shrink-0">
              {formatPoints(q.points_possible)} pt{q.points_possible === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        <CanvasHtml html={q.question_text} className="text-base leading-relaxed" />
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
