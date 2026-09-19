'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { CourseHub, CourseHubSkeleton } from '@/components/course/course-hub';

export default function CoursePage() {
  const params = useParams();
  const courseId = Number.parseInt(params.courseId as string, 10);

  // CourseHub reads ?tab= with useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={<CourseHubSkeleton />}>
      <CourseHub courseId={courseId} />
    </Suspense>
  );
}
