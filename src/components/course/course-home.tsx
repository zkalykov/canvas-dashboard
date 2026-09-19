'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowRightIcon, FileTextIcon, HouseIcon } from '@phosphor-icons/react';
import { useAssignments, useFrontPage } from '@/hooks/use-canvas';
import { assignmentState, isSubmitted } from '@/lib/submission-status';
import type { Course, CoursePage } from '@/lib/types';
import { CanvasHtml } from '@/components/shared/canvas-html';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AssignmentTypeIcon, groupAssignments } from './course-assignments';
import { EmptyState, LockedNotice, canvasProseClass } from './course-ui';
import { ModuleList } from './module-list';

/**
 * Course home: follows the course's Canvas home setting when it points at
 * modules or the syllabus, otherwise front page -> syllabus -> modules.
 */
export function CourseHome({ course, modulesVisible }: { course: Course; modulesVisible: boolean }) {
  const hasSyllabus = Boolean(course.syllabus_body?.trim());
  const preferModules = course.default_view === 'modules' && modulesVisible;
  const preferSyllabus = course.default_view === 'syllabus' && hasSyllabus;
  const needFrontPage = !preferModules && !preferSyllabus;
  const { data: frontPage, loading: frontPageLoading } = useFrontPage(needFrontPage ? course.id : null);

  let main: ReactNode;
  if (preferModules) {
    main = <ModuleList courseId={course.id} />;
  } else if (preferSyllabus) {
    main = <SyllabusCard html={course.syllabus_body} />;
  } else if (frontPageLoading) {
    main = <ContentSkeleton />;
  } else if (frontPage) {
    main = <FrontPageCard courseId={course.id} page={frontPage} />;
  } else if (hasSyllabus) {
    main = <SyllabusCard html={course.syllabus_body} />;
  } else if (modulesVisible) {
    main = <ModuleList courseId={course.id} />;
  } else {
    main = (
      <EmptyState
        icon={HouseIcon}
        title="No home page"
        description="This course doesn't have a front page or syllabus yet. Check the Assignments tab for work that's due."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/courses/${course.id}?tab=assignments`}>
              Go to assignments <ArrowRightIcon />
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">{main}</div>
      <aside className="min-w-0">
        <ComingUp courseId={course.id} />
      </aside>
    </div>
  );
}

function FrontPageCard({ courseId, page }: { courseId: number; page: CoursePage }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
          <span className="break-words">{page.title}</span>
        </CardTitle>
        {page.updated_at && (
          <CardDescription>Updated {format(new Date(page.updated_at), 'MMM d, yyyy')}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {page.locked_for_user ? (
          <LockedNotice html={page.lock_explanation} />
        ) : page.body?.trim() ? (
          <CanvasHtml html={page.body} className={canvasProseClass} />
        ) : (
          <p className="text-sm text-muted-foreground">This page is empty.</p>
        )}
        {page.url && (
          <div className="flex justify-end">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/courses/${courseId}/pages/${encodeURIComponent(page.url)}`}>
                <FileTextIcon /> Open as page
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SyllabusCard({ html }: { html: string | null | undefined }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          Syllabus
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CanvasHtml html={html} className={canvasProseClass} />
      </CardContent>
    </Card>
  );
}

function ContentSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}

/** Next few assignments still to turn in, for the Home tab sidebar. */
function ComingUp({ courseId }: { courseId: number }) {
  const { data, loading, error } = useAssignments(courseId);
  const { upcoming, missing } = useMemo(() => {
    const list = data ?? [];
    return {
      upcoming: groupAssignments(list)
        .upcoming.filter(a => !isSubmitted(a.submission))
        .slice(0, 5),
      missing: list.filter(a => assignmentState(a) === 'missing').length,
    };
  }, [data]);

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Coming up
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load assignments.</p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing due. You&apos;re all caught up.</p>
        ) : (
          <ul className="-mx-2 space-y-1">
            {upcoming.map(assignment => {
              const due = new Date(assignment.due_at as string);
              return (
                <li key={assignment.id}>
                  <Link
                    href={`/courses/${courseId}/assignments/${assignment.id}`}
                    className="flex items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    <AssignmentTypeIcon assignment={assignment} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{assignment.name}</p>
                      <p className="text-xs text-muted-foreground" title={format(due, 'PPpp')}>
                        {format(due, 'EEE, MMM d')} · {formatDistanceToNow(due, { addSuffix: true })}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
          <Link href={`/courses/${courseId}?tab=assignments`}>
            All assignments <ArrowRightIcon />
          </Link>
        </Button>
        {!loading && !error && missing > 0 && (
          <div className="mt-2 flex justify-center">
            <Badge variant="destructive">{missing} missing</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
