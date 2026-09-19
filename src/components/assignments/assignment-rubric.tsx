'use client';

import { ChatTextIcon, CheckIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { RubricAssessmentEntry, RubricCriterion, RubricRating } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatPoints } from './assignment-utils';

type Assessment = Record<string, RubricAssessmentEntry> | null | undefined;

function hasAssessment(assessment: Assessment): assessment is Record<string, RubricAssessmentEntry> {
  if (!assessment) return false;
  return Object.values(assessment).some(
    entry => entry && (entry.points !== null && entry.points !== undefined || !!entry.rating_id || !!entry.comments)
  );
}

function selectedRating(criterion: RubricCriterion, entry: RubricAssessmentEntry | undefined): RubricRating | undefined {
  if (!entry) return undefined;
  if (entry.rating_id) return criterion.ratings.find(r => r.id === entry.rating_id);
  if (entry.points !== null && entry.points !== undefined) {
    const matches = criterion.ratings.filter(r => r.points === entry.points);
    return matches.length === 1 ? matches[0] : undefined;
  }
  return undefined;
}

/**
 * The assignment rubric. When the student's submission has a rubric assessment,
 * the chosen rating is highlighted and the earned points and grader comments are shown.
 */
export function AssignmentRubric({ rubric, assessment }: { rubric: RubricCriterion[]; assessment?: Assessment }) {
  const assessed = hasAssessment(assessment);
  const possible = rubric.reduce((sum, c) => sum + (c.points || 0), 0);
  const earned = assessed
    ? rubric.reduce((sum, c) => sum + (assessment[c.id]?.points ?? 0), 0)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          Rubric
        </CardTitle>
        <CardDescription>
          {assessed
            ? `Your rubric score: ${formatPoints(earned)} / ${formatPoints(possible)} pts`
            : `${rubric.length} criteria · ${formatPoints(possible)} pts total`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rubric.map(criterion => {
          const entry = assessed ? assessment[criterion.id] : undefined;
          const chosen = selectedRating(criterion, entry);
          const points = entry?.points;
          return (
            <section key={criterion.id} className="rounded-lg border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <h3 className="font-semibold leading-snug">{criterion.description}</h3>
                  {criterion.long_description && (
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {criterion.long_description}
                    </p>
                  )}
                </div>
                <Badge variant={points !== null && points !== undefined ? 'default' : 'outline'} className="shrink-0 self-start">
                  {points !== null && points !== undefined
                    ? `${formatPoints(points)} / ${formatPoints(criterion.points)} pts`
                    : `${formatPoints(criterion.points)} pts`}
                </Badge>
              </div>

              {criterion.ratings.length > 0 && (
                <ul className="mt-3 grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
                  {criterion.ratings.map(rating => {
                    const isChosen = chosen?.id === rating.id;
                    return (
                      <li
                        key={rating.id}
                        className={cn(
                          'relative rounded-md border p-2.5 text-sm transition-colors',
                          isChosen
                            ? 'border-primary bg-primary/10 ring-1 ring-primary'
                            : assessed
                              ? 'text-muted-foreground'
                              : 'bg-muted/30'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={cn('font-medium', isChosen && 'text-foreground')}>{rating.description}</span>
                          {isChosen && <CheckIcon className="h-4 w-4 shrink-0 text-primary" aria-label="Selected rating" />}
                        </div>
                        <span className="text-xs">{formatPoints(rating.points)} pts</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {entry?.comments && (
                <div className="mt-3 flex gap-2 rounded-md bg-muted/50 p-3 text-sm">
                  <ChatTextIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="whitespace-pre-line leading-relaxed">{entry.comments}</p>
                </div>
              )}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
