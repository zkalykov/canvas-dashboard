'use client';

import { useMemo } from 'react';
import { useCourseTabs } from '@/hooks/use-canvas';

export type CourseTabId =
  | 'home'
  | 'modules'
  | 'pages'
  | 'files'
  | 'assignments'
  | 'announcements'
  | 'discussions'
  | 'grades';

interface TabDef {
  id: CourseTabId;
  label: string;
  /** Canvas tab id that must be exposed to the student, or null if always shown. */
  canvasTab: string | null;
}

const TABS: TabDef[] = [
  { id: 'home', label: 'Home', canvasTab: null },
  { id: 'modules', label: 'Modules', canvasTab: 'modules' },
  { id: 'pages', label: 'Pages', canvasTab: 'pages' },
  { id: 'files', label: 'Files', canvasTab: 'files' },
  { id: 'assignments', label: 'Assignments', canvasTab: null },
  { id: 'announcements', label: 'Announcements', canvasTab: 'announcements' },
  { id: 'discussions', label: 'Discussions', canvasTab: 'discussions' },
  { id: 'grades', label: 'Grades', canvasTab: null },
];

/**
 * Which of our tabs the student may see. Canvas only lists tabs the user can
 * open (teachers also get `hidden: true` ones). If the request failed or is
 * still loading, everything is shown.
 */
export function useVisibleCourseTabs(courseId: number | null | undefined) {
  const { data: canvasTabs, loading, error } = useCourseTabs(courseId);
  const visible = useMemo(() => {
    if (!canvasTabs || error) return TABS;
    const exposed = new Set(canvasTabs.filter(tab => !tab.hidden).map(tab => tab.id));
    return TABS.filter(tab => !tab.canvasTab || exposed.has(tab.canvasTab));
  }, [canvasTabs, error]);
  const homeTab = canvasTabs?.find(tab => tab.id === 'home');
  return { visible, loading, homeUrl: homeTab?.full_url ?? null };
}
