'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { CalendarBlankIcon, FileTextIcon, FolderSimpleIcon, GraduationCapIcon, HouseIcon, TrayIcon } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { useCourseColors, useCourses, useUnreadConversationCount, useUser } from '@/hooks/use-canvas';
import { useAuth } from '@/lib/auth-context';
import { courseTitle } from '@/lib/course-name';
import { usableAvatar } from '@/lib/avatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSidebar } from './sidebar-context';
import { warmCourse } from './preloader';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Simple sidebar (Link style): six main places, then the student's courses.
 * To-Do, Announcements and Discussions are reached from Home and from each course.
 */
const NAV: { href: string; label: string; icon: PhosphorIcon }[] = [
  { href: '/', label: 'Home', icon: HouseIcon },
  { href: '/assignments', label: 'Assignments', icon: FileTextIcon },
  { href: '/calendar', label: 'Calendar', icon: CalendarBlankIcon },
  { href: '/grades', label: 'Grades', icon: GraduationCapIcon },
  { href: '/files', label: 'Files', icon: FolderSimpleIcon },
  { href: '/inbox', label: 'Inbox', icon: TrayIcon },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname === '/todo' || pathname === '/announcements' || pathname === '/discussions';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: user } = useUser();
  const { data: courses } = useCourses();
  const { getColor } = useCourseColors();
  const { count: unread } = useUnreadConversationCount({ deferred: true });
  const { logout, canvasUrl, testMode, isViewOnly } = useAuth();
  const { theme, setTheme } = useTheme();
  const { isOpen, close } = useSidebar();

  const name = user?.short_name || user?.name || 'Student';
  const avatar = usableAvatar(user?.avatar_url);
  const sub = user?.primary_email || user?.login_id || canvasUrl?.replace(/^https?:\/\//, '') || '';

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={close} aria-hidden="true" />}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-[260px] flex-col bg-shell px-3 pb-3 pt-5 transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:z-40 md:translate-x-0'
        )}
      >
        <div className="flex items-center justify-between px-3 pb-5">
          {/* The wordmark goes to the landing page (/home); Home in the list is the dashboard. */}
          <Link href="/home" className="text-[19px] font-semibold tracking-tight">
            Canvas
          </Link>
          <button onClick={close} className="rounded-full px-3 py-1 text-sm text-muted-foreground hover:bg-shell-hover md:hidden">
            Close
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-0.5">
            {NAV.map(item => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors',
                    active ? 'bg-shell-active font-medium' : 'hover:bg-shell-hover'
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" weight={active ? 'fill' : 'regular'} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.href === '/inbox' && unread > 0 && (
                    <span className="text-[13px] tabular-nums text-muted-foreground">{unread}</span>
                  )}
                </Link>
              );
            })}
          </div>

          {courses && courses.length > 0 && (
            <div className="mt-6">
              <p className="px-3 pb-1.5 text-[13px] text-muted-foreground">Courses</p>
              <div className="space-y-0.5">
                {courses.map(course => {
                  const href = `/courses/${course.id}`;
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <Link
                      key={course.id}
                      href={href}
                      onPointerEnter={() => warmCourse(course.id)}
                      onFocus={() => warmCourse(course.id)}
                      onTouchStart={() => warmCourse(course.id)}
                      className={cn(
                        'flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors',
                        active ? 'bg-shell-active font-medium' : 'text-foreground/85 hover:bg-shell-hover'
                      )}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getColor(course.id) }} />
                      <span className="truncate">{courseTitle(course)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        <div className="mt-3 border-t border-shell-line pt-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-shell-hover">
              {/* The student's Canvas profile picture; the first letter when there is none. */}
              <Avatar className="size-8 shrink-0">
                {avatar && <AvatarImage src={avatar} alt="" referrerPolicy="no-referrer" className="object-cover" />}
                <AvatarFallback delayMs={avatar ? 600 : 0} className="bg-brand text-sm font-semibold text-white">
                  {name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium">{name}</span>
                <span className="block truncate text-[12px] text-muted-foreground">{testMode ? 'Dev mode' : isViewOnly ? 'View only' : sub}</span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel>Appearance</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme ?? 'light'} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {!testMode && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logout()}>Log out</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
