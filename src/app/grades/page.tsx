import { Suspense } from 'react';
import { GradesPage, GradesPageSkeleton } from '@/components/grades/grades-page';

export default function Grades() {
  // GradesPage reads ?course= with useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={<GradesPageSkeleton />}>
      <GradesPage />
    </Suspense>
  );
}
