'use client';

import { useParams } from 'next/navigation';
import { CoursePageView } from '@/components/course/course-page-view';

function decodeParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function CourseWikiPage() {
  const params = useParams();
  const courseId = Number.parseInt(params.courseId as string, 10);
  const pageUrl = decodeParam(params.pageUrl);

  return <CoursePageView courseId={courseId} pageUrl={pageUrl} />;
}
