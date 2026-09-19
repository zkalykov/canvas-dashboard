import { Suspense } from 'react';
import { InboxPage, InboxPageSkeleton } from '@/components/inbox/inbox-page';

export default function Inbox() {
  return (
    <Suspense fallback={<InboxPageSkeleton />}>
      <InboxPage />
    </Suspense>
  );
}
