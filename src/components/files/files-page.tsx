'use client';

import { Suspense, useCallback } from 'react';
import { CourseDot, SideList, SideListHeading, SideListItem } from '@/components/shared/side-list';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { HardDriveIcon } from '@phosphor-icons/react';
import { useCourseColors, useCourses } from '@/hooks/use-canvas';
import { FileBrowser } from '@/components/files/file-browser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { courseCode, courseTitle } from '@/lib/course-name';

type Selection = number | 'user';

function parseSelection(value: string | null): Selection | null {
  if (value === 'user') return 'user';
  if (value && /^\d+$/.test(value)) return Number(value);
  return null;
}

export function FilesPage() {
  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        Files
      </h1>
      {/* useSearchParams needs a Suspense boundary for the static prerender. */}
      <Suspense fallback={<FilesPageSkeleton />}>
        <FilesPageContent />
      </Suspense>
    </div>
  );
}

function FilesPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: courses, loading: coursesLoading, error: coursesError } = useCourses();
  const { getColor } = useCourseColors();

  const requested = parseSelection(searchParams.get('course'));
  // Without ?course=, open the first course (or My files when there are no courses).
  const selected: Selection | null =
    requested ?? (courses ? (courses[0]?.id ?? 'user') : coursesError ? 'user' : null);

  const select = useCallback(
    (value: Selection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('course', String(value));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const selectedCourse = typeof selected === 'number' ? courses?.find(course => course.id === selected) : undefined;
  const title =
    selected === 'user' ? 'My files' : selectedCourse ? courseTitle(selectedCourse) : coursesLoading ? '' : 'Course files';
  const subtitle =
    selected === 'user'
      ? 'Files stored in your personal Canvas account'
      : (courseCode(selectedCourse) ?? undefined);

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <SideList label="File locations" className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <SideListItem
          active={selected === 'user'}
          onClick={() => select('user')}
          title="My files"
          leading={<HardDriveIcon className="h-[17px] w-[17px] shrink-0" weight={selected === 'user' ? 'fill' : 'regular'} aria-hidden="true" />}
        >
          My files
        </SideListItem>

        {(courses || coursesLoading) && <SideListHeading>Courses</SideListHeading>}

        {coursesLoading && !courses && [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}

        {coursesError && !courses && <p className="px-3 py-2 text-[13px] text-muted-foreground">Couldn&apos;t load your courses.</p>}

        {courses?.map(course => (
          <SideListItem
            key={course.id}
            active={selected === course.id}
            onClick={() => select(course.id)}
            title={course.name}
            leading={<CourseDot color={getColor(course.id)} />}
          >
            {courseTitle(course)}
          </SideListItem>
        ))}

        {courses && courses.length === 0 && <p className="px-3 py-2 text-[13px] text-muted-foreground">No active courses.</p>}
      </SideList>

      <Card className="min-w-0 gap-4 py-4 sm:py-6">
        <CardHeader className="px-4 sm:px-6">
          {selected === null ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              {selected === 'user' ? (
                <HardDriveIcon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : (
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: getColor(selected) }}
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 space-y-1">
                {title ? (
                  <CardTitle className="truncate text-lg">{title}</CardTitle>
                ) : (
                  <Skeleton className="h-5 w-48" />
                )}
                {subtitle && <CardDescription className="truncate">{subtitle}</CardDescription>}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {selected === null ? <BrowserSkeleton /> : <FileBrowser context={selected} />}
        </CardContent>
      </Card>
    </div>
  );
}

function BrowserSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function FilesPageSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Skeleton className="h-24 lg:h-80" />
      <Skeleton className="h-96" />
    </div>
  );
}
