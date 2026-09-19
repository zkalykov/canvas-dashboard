'use client';

import { useState } from 'react';
import { ArrowSquareOutIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { useCourseColors } from '@/hooks/use-canvas';
import type { Course } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { courseScores } from './course-ui';
import { courseCode } from '@/lib/course-name';
import { CourseDownloadDialog } from './course-download-dialog';

export function CourseHeader({ course, canvasHref }: { course: Course; canvasHref: string | null }) {
  const { getColor } = useCourseColors();
  const color = getColor(course.id);
  const termName = course.term?.name && course.term.name !== 'Default Term' ? course.term.name : null;
  const [downloadOpen, setDownloadOpen] = useState(false);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="h-2 w-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <div className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {courseCode(course) && <span className="font-medium">{courseCode(course)}</span>}
              {termName && <Badge variant="secondary">{termName}</Badge>}
            </div>
            <h1 className="break-words text-xl font-semibold leading-tight sm:text-2xl tracking-tight">{course.name}</h1>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center md:flex-col md:items-end">
          <CompactScore course={course} />
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setDownloadOpen(true)}>
              <DownloadSimpleIcon /> Download course
            </Button>
            {canvasHref && (
              <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
                <a href={canvasHref} target="_blank" rel="noopener noreferrer">
                  <ArrowSquareOutIcon /> Open in Canvas
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
      <CourseDownloadDialog
        courseId={course.id}
        courseLabel={courseCode(course) ?? course.name}
        courseTitle={course.name}
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
      />
    </Card>
  );
}

function CompactScore({ course }: { course: Course }) {
  const scores = courseScores(course);
  if (!scores.current && !scores.currentGrade && !scores.period) {
    return (
      <div className="rounded-lg border bg-muted/40 px-4 py-2 text-sm text-muted-foreground md:text-right">
        {scores.hidden ? 'Totals hidden by your instructor' : 'No grade yet'}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-2 md:text-right">
      <div className="text-xs text-muted-foreground">Current grade</div>
      <div className="flex items-baseline gap-2 md:justify-end">
        {scores.current && <span className="text-2xl font-bold tabular-nums">{scores.current}</span>}
        {scores.currentGrade && (
          <Badge variant="secondary" className="text-sm">
            {scores.currentGrade}
          </Badge>
        )}
      </div>
      {scores.period && (
        <div className="text-xs text-muted-foreground">
          {scores.periodTitle ?? 'This grading period'}:{' '}
          <span className="font-medium tabular-nums text-foreground">{scores.period}</span>
          {scores.periodGrade && ` (${scores.periodGrade})`}
        </div>
      )}
    </div>
  );
}

export function CourseHeaderSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Skeleton className="h-2 w-full rounded-none" />
      <div className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:justify-between">
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-64 max-w-[60vw]" />
          </div>
        </div>
        <Skeleton className="h-16 w-40" />
      </div>
    </Card>
  );
}
