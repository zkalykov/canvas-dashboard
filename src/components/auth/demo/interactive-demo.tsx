'use client';

import { useEffect, useState } from 'react';
import { format, formatDistanceToNowStrict, isSameDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday } from 'date-fns';
import {
  ArrowLeftIcon,
  CalendarBlankIcon,
  CaretRightIcon,
  FileDocIcon,
  FilePdfIcon,
  FileTextIcon,
  FolderSimpleIcon,
  GraduationCapIcon,
  HouseIcon,
  PresentationIcon,
  TrayIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { CourseDot, SideList, SideListItem } from '@/components/shared/side-list';
import {
  ASSIGNMENTS,
  CONVERSATIONS,
  COURSES,
  FILES,
  GRADE_GROUPS,
  courseById,
  type DemoAssignment,
  type DemoFile,
} from './demo-data';

type View =
  | { name: 'home' }
  | { name: 'assignments' }
  | { name: 'assignment'; id: number; back: View }
  | { name: 'calendar' }
  | { name: 'grades'; courseId: number }
  | { name: 'files'; courseId: number }
  | { name: 'inbox'; id: number | null }
  | { name: 'course'; id: number };

const NAV: { key: View['name']; label: string; icon: PhosphorIcon; to: View }[] = [
  { key: 'home', label: 'Home', icon: HouseIcon, to: { name: 'home' } },
  { key: 'assignments', label: 'Assignments', icon: FileTextIcon, to: { name: 'assignments' } },
  { key: 'calendar', label: 'Calendar', icon: CalendarBlankIcon, to: { name: 'calendar' } },
  { key: 'grades', label: 'Grades', icon: GraduationCapIcon, to: { name: 'grades', courseId: 1 } },
  { key: 'files', label: 'Files', icon: FolderSimpleIcon, to: { name: 'files', courseId: 1 } },
  { key: 'inbox', label: 'Inbox', icon: TrayIcon, to: { name: 'inbox', id: null } },
];

// ---- helpers (outside components so renders stay pure) ----
function hoursUntil(date: Date) {
  return (date.getTime() - Date.now()) / 36e5;
}

function status(a: DemoAssignment): { text: string; tone: 'bad' | 'warn' | 'good' | 'muted' } {
  if (a.state === 'missing') return { text: 'Missing', tone: 'bad' };
  if (a.state === 'graded') return { text: `${a.score} / ${a.points}`, tone: 'good' };
  if (a.state === 'submitted') return { text: 'Submitted', tone: 'good' };
  return { text: formatDistanceToNowStrict(a.due, { addSuffix: true }), tone: hoursUntil(a.due) < 24 ? 'warn' : 'muted' };
}

const TONE: Record<string, string> = {
  bad: 'font-medium text-destructive',
  warn: 'font-medium text-amber-600 dark:text-amber-400',
  good: 'text-success',
  muted: 'text-muted-foreground',
};

function dueThisWeek() {
  return ASSIGNMENTS.filter(a => a.state === 'open' && hoursUntil(a.due) <= 7 * 24).length;
}

function todoList() {
  const missing = ASSIGNMENTS.filter(a => a.state === 'missing');
  const open = ASSIGNMENTS.filter(a => a.state === 'open').sort((a, b) => a.due.getTime() - b.due.getTime());
  return [...missing, ...open];
}

function calendarDays() {
  const today = new Date();
  return eachDayOfInterval({ start: startOfWeek(startOfMonth(today)), end: endOfWeek(endOfMonth(today)) });
}

function fromNow(date: Date) {
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

// ---- small building blocks ----
function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('h-2 w-2 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} />;
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between px-5 pt-4">
        <h3 className="text-[14px] font-medium">{title}</h3>
        {action}
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

function Row({ onClick, lead, title, sub, value, tone = 'muted' }: { onClick?: () => void; lead?: React.ReactNode; title: string; sub?: string; value?: string; tone?: string }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted">
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px]">{title}</span>
        {sub && <span className="block truncate text-[12px] text-muted-foreground">{sub}</span>}
      </span>
      {value && <span className={cn('shrink-0 text-[13px] tabular-nums', TONE[tone])}>{value}</span>}
      <CaretRightIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[20px] font-semibold tracking-tight">{children}</h2>;
}

/** Same sidebar-style list as the real Grades and Files pages. */
function CourseList({ selected, onSelect }: { selected: number; onSelect: (id: number) => void }) {
  return (
    <SideList label="Courses">
      {COURSES.map(c => (
        <SideListItem
          key={c.id}
          active={selected === c.id}
          onClick={() => onSelect(c.id)}
          leading={<CourseDot color={c.color} />}
          trailing={`${c.grade}%`}
        >
          {c.name}
        </SideListItem>
      ))}
    </SideList>
  );
}

// ---- the demo ----
export function InteractiveDemo() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [file, setFile] = useState<DemoFile | null>(null);
  const [read, setRead] = useState<number[]>([]);
  const unread = CONVERSATIONS.filter(c => c.unread && !read.includes(c.id)).length;

  const activeNav = view.name === 'assignment' ? 'assignments' : view.name === 'course' ? null : view.name;
  const openAssignment = (id: number) => setView({ name: 'assignment', id, back: view });

  return (
    <div className="relative flex h-full bg-shell text-left text-foreground">
      <aside className="hidden w-[220px] shrink-0 flex-col px-3 pb-3 pt-5 md:flex">
        <p className="px-3 pb-5 text-[17px] font-semibold tracking-tight">Canvas</p>
        {NAV.map(item => {
          const Icon = item.icon;
          const active = activeNav === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.to)}
              className={cn('flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors', active ? 'bg-shell-active font-medium' : 'hover:bg-shell-hover')}
            >
              <Icon className="h-[17px] w-[17px]" weight={active ? 'fill' : 'regular'} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.key === 'inbox' && unread > 0 && <span className="text-[12px] text-muted-foreground">{unread}</span>}
            </button>
          );
        })}
        <p className="px-3 pb-1.5 pt-6 text-[12px] text-muted-foreground">Courses</p>
        {COURSES.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => setView({ name: 'course', id: c.id })}
            className={cn(
              'flex h-8 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors',
              view.name === 'course' && view.id === c.id ? 'bg-shell-active font-medium' : 'text-foreground/85 hover:bg-shell-hover'
            )}
          >
            <Dot color={c.color} />
            {c.name}
          </button>
        ))}
        <div className="mt-auto flex items-center gap-3 border-t border-shell-line px-2 pt-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-[13px] font-semibold text-white">A</span>
          <span>
            <span className="block text-[13px] font-medium">Alex Johnson</span>
            <span className="block text-[11px] text-muted-foreground">Demo account</span>
          </span>
        </div>
      </aside>

      <div className="m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-shell-line bg-background md:ml-0">
        <nav className="flex gap-1 overflow-x-auto border-b border-shell-line px-3 py-2 md:hidden">
          {NAV.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.to)}
              className={cn('shrink-0 rounded-full px-3 py-1 text-[13px]', activeNav === item.key ? 'bg-muted font-medium' : 'text-muted-foreground')}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 group-data-[live=false]/demo:overflow-hidden md:px-10 md:py-9">
          <div className="mx-auto max-w-[860px]">
            {view.name === 'home' && <HomeView go={setView} openAssignment={openAssignment} />}
            {view.name === 'assignments' && <AssignmentsView openAssignment={openAssignment} />}
            {view.name === 'assignment' && <AssignmentView id={view.id} onBack={() => setView(view.back)} />}
            {view.name === 'calendar' && <CalendarView openAssignment={openAssignment} />}
            {view.name === 'grades' && <GradesView courseId={view.courseId} onSelect={id => setView({ name: 'grades', courseId: id })} />}
            {view.name === 'files' && (
              <FilesView courseId={view.courseId} onSelect={id => setView({ name: 'files', courseId: id })} onOpen={setFile} />
            )}
            {view.name === 'inbox' && (
              <InboxView
                id={view.id}
                read={read}
                onOpen={id => {
                  setRead(r => (r.includes(id) ? r : [...r, id]));
                  setView({ name: 'inbox', id });
                }}
              />
            )}
            {view.name === 'course' && <CourseView id={view.id} openAssignment={openAssignment} onOpenFile={setFile} />}
          </div>
        </div>
      </div>

      {file && <FilePreview file={file} onClose={() => setFile(null)} />}
    </div>
  );
}

function HomeView({ go, openAssignment }: { go: (v: View) => void; openAssignment: (id: number) => void }) {
  const todo = todoList().slice(0, 5);
  const graded = ASSIGNMENTS.filter(a => a.state === 'graded');
  const missing = ASSIGNMENTS.filter(a => a.state === 'missing').length;
  return (
    <div className="space-y-8">
      <div>
        <p className="text-[26px] font-semibold leading-tight tracking-tight">Hi, Alex</p>
        <p className="text-[26px] font-semibold leading-tight tracking-tight text-muted-foreground">
          {missing ? `${missing} assignment is missing` : `${dueThisWeek()} things due this week`}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="To do" action={<button onClick={() => go({ name: 'assignments' })} className="text-[12px] text-muted-foreground hover:text-foreground">View all</button>}>
          {todo.map(a => {
            const s = status(a);
            return <Row key={a.id} onClick={() => openAssignment(a.id)} title={a.name} sub={`${courseById(a.courseId).name} · ${format(a.due, 'EEE, MMM d, h:mm a')}`} value={s.text} tone={s.tone} />;
          })}
        </Panel>
        <Panel title="Recent grades" action={<button onClick={() => go({ name: 'grades', courseId: 1 })} className="text-[12px] text-muted-foreground hover:text-foreground">View all</button>}>
          {graded.map(a => (
            <Row key={a.id} onClick={() => openAssignment(a.id)} title={a.name} sub={`${courseById(a.courseId).name} · ${fromNow(a.due)}`} value={`${a.score} / ${a.points}`} />
          ))}
        </Panel>
      </div>
      <Panel title="Courses">
        {COURSES.map(c => (
          <Row
            key={c.id}
            onClick={() => go({ name: 'course', id: c.id })}
            lead={<span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[13px] font-semibold text-white" style={{ backgroundColor: c.color }}>{c.name.charAt(0)}</span>}
            title={c.name}
            sub={c.code}
            value={`${c.grade}% ${c.letter}`}
          />
        ))}
      </Panel>
    </div>
  );
}

const FILTERS = [
  { key: 'upcoming', label: 'Upcoming', test: (a: DemoAssignment) => a.due.getTime() >= Date.now() },
  { key: 'missing', label: 'Missing', test: (a: DemoAssignment) => a.state === 'missing' },
  { key: 'submitted', label: 'Submitted', test: (a: DemoAssignment) => a.state === 'submitted' || a.state === 'graded' },
  { key: 'all', label: 'All', test: () => true },
] as const;

function AssignmentsView({ openAssignment }: { openAssignment: (id: number) => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('upcoming');
  const active = FILTERS.find(f => f.key === filter)!;
  const list = ASSIGNMENTS.filter(active.test).sort((a, b) => a.due.getTime() - b.due.getTime());
  return (
    <div className="space-y-5">
      <Title>Assignments</Title>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn('rounded-full px-3 py-1 text-[13px]', filter === f.key ? 'bg-foreground text-background' : 'bg-muted text-foreground/80 hover:bg-accent')}
          >
            {f.label} <span className="opacity-60">{ASSIGNMENTS.filter(f.test).length}</span>
          </button>
        ))}
      </div>
      <div className="rounded-2xl bg-muted/70 p-1.5">
        {list.map(a => {
          const s = status(a);
          return (
            <Row
              key={a.id}
              onClick={() => openAssignment(a.id)}
              lead={<Dot color={courseById(a.courseId).color} />}
              title={a.name}
              sub={`${courseById(a.courseId).name} · Due ${format(a.due, 'EEE, MMM d, h:mm a')}`}
              value={s.text}
              tone={s.tone}
            />
          );
        })}
      </div>
    </div>
  );
}

function AssignmentView({ id, onBack }: { id: number; onBack: () => void }) {
  const a = ASSIGNMENTS.find(x => x.id === id)!;
  const course = courseById(a.courseId);
  const s = status(a);
  const stateLabel = { open: 'Not submitted yet', missing: 'Missing', submitted: 'Submitted, waiting for a grade', graded: 'Graded' }[a.state];
  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="h-3.5 w-3.5" /> Back
      </button>
      <div>
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Dot color={course.color} />{course.name}</p>
        <h2 className="mt-1 text-[22px] font-semibold tracking-tight">{a.name}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Due {format(a.due, 'EEEE, MMMM d, h:mm a')} · {a.points} points</p>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/70 p-4 text-[13px]">
        <div><p className="text-muted-foreground">Status</p><p className={cn('mt-0.5', TONE[s.tone === 'muted' ? 'muted' : s.tone])}>{stateLabel}</p></div>
        <div><p className="text-muted-foreground">Score</p><p className="mt-0.5">{a.score !== undefined ? `${a.score} / ${a.points}` : '–'}</p></div>
        <div><p className="text-muted-foreground">Due</p><p className="mt-0.5">{fromNow(a.due)}</p></div>
      </div>
      <div>
        <h3 className="text-[14px] font-medium">Instructions</h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-foreground/85">{a.description}</p>
      </div>
      {(a.state === 'open' || a.state === 'missing') && (
        <div className="rounded-2xl border border-dashed p-5 text-center">
          <p className="text-[14px] font-medium">Drop files here or write your answer</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">This is a demo. Sign in to submit real work.</p>
        </div>
      )}
    </div>
  );
}

function CalendarView({ openAssignment }: { openAssignment: (id: number) => void }) {
  const [days] = useState(calendarDays);
  return (
    <div className="space-y-5">
      <Title>{format(days[10], 'MMMM yyyy')}</Title>
      <div className="grid grid-cols-7 overflow-hidden rounded-2xl border text-[12px]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="border-b bg-muted/60 px-2 py-1.5 text-muted-foreground">{d}</div>
        ))}
        {days.map(day => {
          const items = ASSIGNMENTS.filter(a => isSameDay(a.due, day));
          return (
            <div key={day.toISOString()} className={cn('min-h-[74px] border-b border-r p-1.5', !isSameMonth(day, days[10]) && 'bg-muted/30 text-muted-foreground')}>
              <span className={cn('inline-grid h-5 w-5 place-items-center rounded-full', isToday(day) && 'bg-foreground text-background')}>{format(day, 'd')}</span>
              {items.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openAssignment(a.id)}
                  className="mt-1 block w-full truncate rounded px-1 py-0.5 text-left text-[11px] text-white"
                  style={{ backgroundColor: courseById(a.courseId).color }}
                >
                  {a.name}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GradesView({ courseId, onSelect }: { courseId: number; onSelect: (id: number) => void }) {
  const course = courseById(courseId);
  return (
    <div className="space-y-5">
      <Title>Grades</Title>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <CourseList selected={courseId} onSelect={onSelect} />
        <div className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="flex items-center gap-2 text-[12px] text-muted-foreground"><Dot color={course.color} />{course.code}</p>
              <p className="text-[18px] font-semibold tracking-tight">{course.name}</p>
            </div>
            <p className="text-[32px] font-semibold tracking-tight tabular-nums">
              {course.grade}%<span className="ml-1.5 text-[16px] font-medium text-muted-foreground">{course.letter}</span>
            </p>
          </div>
          {GRADE_GROUPS[courseId].map(group => (
            <section key={group.name}>
              <div className="flex justify-between px-1 pb-1.5 text-[13px]">
                <span className="font-medium">{group.name} <span className="font-normal text-muted-foreground">· {group.weight}% of grade</span></span>
              </div>
              <div className="rounded-2xl bg-muted/70 p-1.5">
                {group.items.map(item => (
                  <div key={item.name} className="flex items-center justify-between rounded-xl px-3 py-2 text-[13px]">
                    <span>{item.name}</span>
                    <span className="tabular-nums">
                      {item.score ?? '–'}<span className="text-muted-foreground"> / {item.points}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function fileIcon(kind: DemoFile['kind']) {
  return kind === 'pdf' ? FilePdfIcon : kind === 'slides' ? PresentationIcon : FileDocIcon;
}

function FileRows({ files, onOpen }: { files: DemoFile[]; onOpen: (f: DemoFile) => void }) {
  return (
    <div className="rounded-2xl bg-muted/70 p-1.5">
      {files.map(f => {
        const Icon = fileIcon(f.kind);
        return <Row key={f.id} onClick={() => onOpen(f)} lead={<Icon className="h-5 w-5 text-muted-foreground" />} title={f.name} sub={f.size} />;
      })}
    </div>
  );
}

function FilesView({ courseId, onSelect, onOpen }: { courseId: number; onSelect: (id: number) => void; onOpen: (f: DemoFile) => void }) {
  return (
    <div className="space-y-5">
      <Title>Files</Title>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <CourseList selected={courseId} onSelect={onSelect} />
        <FileRows files={FILES.filter(f => f.courseId === courseId)} onOpen={onOpen} />
      </div>
    </div>
  );
}

function InboxView({ id, read, onOpen }: { id: number | null; read: number[]; onOpen: (id: number) => void }) {
  const open = CONVERSATIONS.find(c => c.id === id);
  return (
    <div className="space-y-5">
      <Title>Inbox</Title>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="h-fit space-y-0.5">
          {CONVERSATIONS.map(c => {
            const unread = c.unread && !read.includes(c.id);
            const last = c.messages[c.messages.length - 1];
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpen(c.id)}
                className={cn('flex w-full gap-2 rounded-lg px-3 py-2 text-left transition-colors', id === c.id ? 'bg-muted' : 'hover:bg-muted/70')}
              >
                <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')} />
                <span className="min-w-0">
                  <span className={cn('block truncate text-[13px]', unread && 'font-medium')}>{c.subject}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{last.from} · {last.body}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="rounded-2xl border p-5">
          {open ? (
            <div className="space-y-4">
              <div>
                <p className="text-[16px] font-semibold">{open.subject}</p>
                <p className="text-[12px] text-muted-foreground">{courseById(open.courseId).name}</p>
              </div>
              {open.messages.map((m, i) => (
                <div key={i} className={cn('max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px]', m.from === 'You' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted')}>
                  <p className="mb-0.5 text-[11px] opacity-70">{m.from} · {fromNow(m.at)}</p>
                  {m.body}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-muted-foreground">Choose a conversation to read it.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CourseView({ id, openAssignment, onOpenFile }: { id: number; openAssignment: (id: number) => void; onOpenFile: (f: DemoFile) => void }) {
  const [tab, setTab] = useState<'assignments' | 'files'>('assignments');
  const course = courseById(id);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground"><Dot color={course.color} />{course.code} · {course.teacher}</p>
          <h2 className="mt-1 text-[22px] font-semibold tracking-tight">{course.name}</h2>
        </div>
        <p className="text-[28px] font-semibold tracking-tight">{course.grade}%</p>
      </div>
      <div className="flex gap-1">
        {(['assignments', 'files'] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn('rounded-full px-3 py-1 text-[13px] capitalize', tab === t ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'assignments' ? (
        <div className="rounded-2xl bg-muted/70 p-1.5">
          {ASSIGNMENTS.filter(a => a.courseId === id).map(a => {
            const s = status(a);
            return <Row key={a.id} onClick={() => openAssignment(a.id)} title={a.name} sub={`Due ${format(a.due, 'EEE, MMM d')}`} value={s.text} tone={s.tone} />;
          })}
        </div>
      ) : (
        <FileRows files={FILES.filter(f => f.courseId === id)} onOpen={onOpenFile} />
      )}
    </div>
  );
}

function FilePreview({ file, onClose }: { file: DemoFile; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-background shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <p className="text-[14px] font-medium">{file.name}</p>
            <p className="text-[12px] text-muted-foreground">{courseById(file.courseId).name} · {file.size}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted" aria-label="Close preview">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto bg-muted/60 p-6">
          <div className="mx-auto max-w-md rounded-md bg-white p-8 text-[13px] leading-relaxed text-neutral-800 shadow">
            <p className="mb-4 text-[18px] font-semibold text-neutral-900">{file.pages[0]}</p>
            {file.pages.slice(1).map(p => (
              <p key={p} className="mb-3">{p}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
