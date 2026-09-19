'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useCalendar, useCourses, useCourseColors } from '@/hooks/use-canvas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CalendarEvent } from '@/lib/types';
import { ArrowSquareOutIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns';
import { courseTitle } from '@/lib/course-name';

export function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const { data: events, loading, error } = useCalendar(startDate, endDate);
  const { data: courses } = useCourses();

  const { getColor } = useCourseColors();

  const courseIdFromContext = (contextCode: string) => {
    const match = contextCode.match(/^course_(\d+)$/);
    return match ? Number(match[1]) : null;
  };

  // Personal (user_*) events have no course; show them in a neutral color.
  const getEventColor = (contextCode: string) => {
    const courseId = courseIdFromContext(contextCode);
    return courseId ? getColor(courseId) : '#64748b';
  };

  const getCourseName = (contextCode: string) => {
    const courseId = courseIdFromContext(contextCode);
    if (!courseId) return 'Personal';
    const course = courses?.find(c => c.id === courseId);
    return course ? courseTitle(course) : contextCode;
  };

  const eventHref = (event: CalendarEvent) => {
    const courseId = courseIdFromContext(event.context_code);
    if (event.type === 'assignment' && event.assignment && courseId) {
      return `/courses/${courseId}/assignments/${event.assignment.id}`;
    }
    return null;
  };

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let day = calStart;
    while (day <= calEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  const getEventsForDate = (date: Date) => {
    if (!events) return [];
    return events.filter(event => isSameDay(new Date(event.start_at), date));
  };

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Calendar Grid */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {format(currentMonth, 'MMMM yyyy')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <CaretLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCurrentMonth(new Date());
                setSelectedDate(new Date());
              }}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <CaretRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-96 w-full" />
          ) : error ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Couldn&apos;t load your calendar. Try reloading the page.</p>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden">
              {/* Day headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div
                  key={day}
                  className="bg-background p-2 text-center text-sm font-medium text-muted-foreground"
                >
                  {day}
                </div>
              ))}

              {/* Calendar days */}
              {calendarDays.map((day, index) => {
                const dayEvents = getEventsForDate(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, currentMonth);

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      bg-background p-2 min-h-24 text-left transition-colors hover:bg-muted
                      ${!isCurrentMonth ? 'opacity-40' : ''}
                      ${isSelected ? 'ring-2 ring-primary' : ''}
                    `}
                  >
                    <span
                      className={`
                        inline-flex h-6 w-6 items-center justify-center rounded-full text-sm
                        ${isToday(day) ? 'bg-primary text-primary-foreground' : ''}
                      `}
                    >
                      {format(day, 'd')}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, 3).map((event, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1 rounded px-1 text-xs truncate text-white"
                          style={{ backgroundColor: getEventColor(event.context_code) }}
                        >
                          {event.type === 'assignment' ? '📝' : '📅'}
                          <span className="truncate">{event.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-muted-foreground px-1">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Day Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'Select a day'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            {selectedDateEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events on this day</p>
            ) : (
              <div className="space-y-3">
                {selectedDateEvents.map(event => {
                  const inAppHref = eventHref(event);
                  const content = (
                    <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: getEventColor(event.context_code) }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {getCourseName(event.context_code)}
                          </span>
                        </div>
                        <p className="font-medium text-sm">{event.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(event.start_at), 'h:mm a')}
                        </p>
                        <Badge variant="outline" className="mt-2 text-xs">
                          {event.type === 'assignment' ? 'Assignment' : 'Event'}
                        </Badge>
                      </div>
                      {!inAppHref && <ArrowSquareOutIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                    </div>
                    </>
                  );
                  const className = 'block rounded-lg border p-3 transition-colors hover:bg-muted';
                  return inAppHref ? (
                    <Link key={`${event.type}-${event.id}`} href={inAppHref} className={className}>
                      {content}
                    </Link>
                  ) : (
                    <a
                      key={`${event.type}-${event.id}`}
                      href={event.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                    >
                      {content}
                    </a>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
