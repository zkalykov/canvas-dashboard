'use client';

import { DownloadSimpleIcon, EyeIcon, FileAudioIcon, FileIcon, FileImageIcon, FileTextIcon, FileVideoIcon } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import type { PreviewableFile } from '@/components/files/file-preview-dialog';
import { fileContentUrl, fileKind, formatFileSize, type FileKind } from '@/lib/files';
import type { Attachment } from '@/lib/types';
import { cn } from '@/lib/utils';

const KIND_ICONS: Record<FileKind, PhosphorIcon> = {
  image: FileImageIcon,
  pdf: FileTextIcon,
  video: FileVideoIcon,
  audio: FileAudioIcon,
  text: FileTextIcon,
  other: FileIcon,
};

/** Submission / comment attachments with a preview button and a download link each. */
export function AttachmentList({
  attachments,
  onPreview,
  className,
}: {
  attachments: Attachment[];
  onPreview: (file: PreviewableFile) => void;
  className?: string;
}) {
  if (attachments.length === 0) return null;

  return (
    <ul className={cn('space-y-2', className)}>
      {attachments.map(file => {
        const name = file.display_name || file.filename || 'File';
        const contentType = file['content-type'] || file.content_type;
        const Icon = KIND_ICONS[fileKind(contentType, name)];
        const size = formatFileSize(file.size);
        return (
          <li key={file.id} className="flex items-center gap-3 rounded-lg border bg-background/60 p-2 pl-3">
            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <button
              type="button"
              onClick={() => onPreview(file)}
              className="min-w-0 flex-1 text-left"
              title={`Preview ${name}`}
            >
              <span className="block truncate text-sm font-medium hover:underline">{name}</span>
              {size && <span className="block text-xs text-muted-foreground">{size}</span>}
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => onPreview(file)} aria-label={`Preview ${name}`}>
                <EyeIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Preview</span>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={fileContentUrl(file.id, { download: true })} aria-label={`Download ${name}`}>
                  <DownloadSimpleIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span>
                </a>
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
