'use client';

import { useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { useCourse } from '@/hooks/use-canvas';
import { CanvasApiError } from '@/lib/canvas-api';
import { useAuth } from '@/lib/auth-context';
import { FileBrowser } from '@/components/files/file-browser';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { CourseAnnouncements } from './course-announcements';
import { CourseAssignments } from './course-assignments';
import { CourseDiscussions } from './course-discussions';
import { CourseGrades } from './course-grades';
import { CourseHeader, CourseHeaderSkeleton } from './course-header';
import { CourseHome } from './course-home';
import { CoursePagesList } from './course-pages-list';
import { useVisibleCourseTabs, type CourseTabId } from './course-tabs';
import { ErrorState, canvasWebUrl, safeHttpUrl } from './course-ui';
import { ModuleList } from './module-list';

export function CourseHub({ courseId }: { courseId: number }) {
  const validId = Number.isFinite(courseId) && courseId > 0 ? courseId : null;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { canvasUrl } = useAuth();

  const { data: course, loading, error, refetch } = useCourse(validId);
  const { visible, homeUrl } = useVisibleCourseTabs(validId);

  const requested = searchParams.get('tab');
  const activeTab: CourseTabId = visible.some(tab => tab.id === requested) ? (requested as CourseTabId) : 'home';

  // Shallow URL update: Next syncs useSearchParams with history.replaceState, no server round trip.
  const onTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === 'home') params.delete('tab');
      else params.set('tab', value);
      const query = params.toString();
      window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
    },
    [pathname, searchParams]
  );

  if (!validId) {
    return (
      <HubShell>
        <ErrorState error={new CanvasApiError(404, 'Invalid course id')} subject="this course" />
      </HubShell>
    );
  }

  if (loading) return <CourseHubSkeleton />;

  if (error || !course) {
    return (
      <HubShell>
        <ErrorState error={error} subject="this course" onRetry={() => refetch()} />
      </HubShell>
    );
  }

  const canvasHref = safeHttpUrl(homeUrl) ?? canvasWebUrl(canvasUrl, `/courses/${course.id}`);
  const modulesVisible = visible.some(tab => tab.id === 'modules');

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <CourseHeader course={course} canvasHref={canvasHref} />

      <Tabs value={activeTab} onValueChange={onTabChange} className="gap-4">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          <TabsList className="w-max">
            {visible.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="px-3">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="home">
          <CourseHome course={course} modulesVisible={modulesVisible} />
        </TabsContent>
        <TabsContent value="modules">
          <ModuleList courseId={course.id} />
        </TabsContent>
        <TabsContent value="pages">
          <CoursePagesList courseId={course.id} />
        </TabsContent>
        <TabsContent value="files" className="min-w-0">
          <FileBrowser context={course.id} />
        </TabsContent>
        <TabsContent value="assignments">
          <CourseAssignments courseId={course.id} />
        </TabsContent>
        <TabsContent value="announcements">
          <CourseAnnouncements courseId={course.id} />
        </TabsContent>
        <TabsContent value="discussions">
          <CourseDiscussions courseId={course.id} />
        </TabsContent>
        <TabsContent value="grades">
          <CourseGrades course={course} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HubShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href="/">
          <ArrowLeftIcon /> Dashboard
        </Link>
      </Button>
      {children}
    </div>
  );
}

export function CourseHubSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <CourseHeaderSkeleton />
      <Skeleton className="h-9 w-full max-w-2xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}
