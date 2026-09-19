'use client';

import { Dashboard } from '@/components/dashboard/dashboard';

// Logged-out visitors see the landing page (rendered by MainLayout) instead.
export default function DashboardPage() {
  return <Dashboard />;
}
