'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { CaretRightIcon, FileTextIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { usePages } from '@/hooks/use-canvas';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, ListSkeleton } from './course-ui';

export function CoursePagesList({ courseId }: { courseId: number }) {
  const { data, loading, error, refetch } = usePages(courseId);
  const [query, setQuery] = useState('');

  const pages = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...(data ?? [])]
      .filter(page => !term || page.title.toLowerCase().includes(term))
      .sort((a, b) => Number(b.front_page) - Number(a.front_page) || a.title.localeCompare(b.title));
  }, [data, query]);

  if (loading) return <ListSkeleton rows={6} />;
  if (error) return <ErrorState error={error} subject="this course's pages" onRetry={() => refetch()} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={FileTextIcon}
        title="No pages yet"
        description="Your instructor hasn't published any pages for this course."
      />
    );
  }

  return (
    <div className="space-y-4">
      {data.length > 8 && (
        <div className="relative max-w-sm">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search pages"
            aria-label="Search pages"
            className="pl-9"
          />
        </div>
      )}

      {pages.length === 0 ? (
        <EmptyState icon={MagnifyingGlassIcon} title="No matching pages" description={`Nothing matches “${query.trim()}”.`} />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {pages.map(page => (
              <li key={page.page_id ?? page.url}>
                <Link
                  href={`/courses/${courseId}/pages/${encodeURIComponent(page.url)}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <FileTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words font-medium">{page.title}</span>
                      {page.front_page && (
                        <Badge variant="secondary">
                          Front page
                        </Badge>
                      )}
                      {page.locked_for_user && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Locked
                        </Badge>
                      )}
                    </div>
                    {page.updated_at && (
                      <p className="text-xs text-muted-foreground">
                        Updated {format(new Date(page.updated_at), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                  <CaretRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
