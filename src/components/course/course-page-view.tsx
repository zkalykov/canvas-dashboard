'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeftIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { useCourse, useCourseColors, usePage } from '@/hooks/use-canvas';
import { CanvasApiError } from '@/lib/canvas-api';
import { useAuth } from '@/lib/auth-context';
import { CanvasHtml } from '@/components/shared/canvas-html';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useVisibleCourseTabs } from './course-tabs';
import { ErrorState, LockedNotice, canvasProseClass, canvasWebUrl, safeHttpUrl } from './course-ui';
import { courseTitle } from '@/lib/course-name';

export function CoursePageView({ courseId, pageUrl }: { courseId: number; pageUrl: string }) {
  const validId = Number.isFinite(courseId) && courseId > 0 ? courseId : null;
  const { data: page, loading, error, refetch } = usePage(validId, pageUrl || null);
  const { data: course } = useCourse(validId);
  const { visible } = useVisibleCourseTabs(validId);
  const { getColor } = useCourseColors();
  const { canvasUrl } = useAuth();

  // Back to the Pages tab when the student can see it, otherwise wherever pages are reachable from.
  const backTab = visible.some(tab => tab.id === 'pages')
    ? 'pages'
    : visible.some(tab => tab.id === 'modules')
      ? 'modules'
      : null;
  const backHref = `/courses/${courseId}${backTab ? `?tab=${backTab}` : ''}`;
  const courseLabel = course ? courseTitle(course) : 'course';
  const backLabel = backTab === 'pages' ? `${courseLabel} pages` : backTab === 'modules' ? `${courseLabel} modules` : courseLabel;

  const backButton = (
    <Button asChild variant="ghost" className="-ml-3 max-w-full">
      <Link href={backHref}>
        <ArrowLeftIcon />
        <span className="truncate">Back to {backLabel}</span>
      </Link>
    </Button>
  );

  if (!validId || !pageUrl) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 pb-10">
        {backButton}
        <ErrorState error={new CanvasApiError(404, 'Invalid page address')} subject="this page" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 pb-10">
        {backButton}
        <Card>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-2/3" />
            <div className="space-y-2 pt-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 pb-10">
        {backButton}
        <ErrorState error={error} subject="this page" onRetry={() => refetch()} />
      </div>
    );
  }

  const canvasHref =
    safeHttpUrl(page.html_url) ?? canvasWebUrl(canvasUrl, `/courses/${courseId}/pages/${encodeURIComponent(page.url)}`);
  const locked = Boolean(page.locked_for_user);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      {backButton}

      <Card className="gap-0 overflow-hidden py-0">
        <div className="h-1.5 w-full" style={{ backgroundColor: getColor(courseId) }} aria-hidden="true" />
        <div className="space-y-6 p-4 sm:p-8">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getColor(courseId) }} />
              <Link href={`/courses/${courseId}`} className="font-medium hover:text-foreground hover:underline">
                {course ? courseTitle(course) : 'Course'}
              </Link>
              {page.front_page && (
                <Badge variant="secondary">
                  Front page
                </Badge>
              )}
            </div>
            <h1 className="break-words text-xl font-semibold leading-tight sm:text-2xl tracking-tight">{page.title}</h1>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {page.updated_at ? (
                <p className="text-sm text-muted-foreground">
                  Updated {format(new Date(page.updated_at), "MMMM d, yyyy 'at' h:mm a")}
                </p>
              ) : (
                <span />
              )}
              {canvasHref && (
                <Button asChild variant="outline" size="sm">
                  <a href={canvasHref} target="_blank" rel="noopener noreferrer">
                    <ArrowSquareOutIcon /> Open in Canvas
                  </a>
                </Button>
              )}
            </div>
          </header>

          {locked && <LockedNotice html={page.lock_explanation} />}

          {page.body?.trim() ? (
            <div className="border-t pt-6">
              <CanvasHtml html={page.body} className={canvasProseClass} />
            </div>
          ) : (
            !locked && <p className="border-t pt-6 text-sm text-muted-foreground">This page has no content yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
