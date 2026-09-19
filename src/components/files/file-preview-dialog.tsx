'use client';

import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { ArrowSquareOutIcon, CircleNotchIcon, DownloadSimpleIcon, FileDashedIcon } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useFile } from '@/hooks/use-canvas';
import { fileContentUrl, fileKind, formatFileSize } from '@/lib/files';

/** Anything with a Canvas file id: CanvasFile, submission Attachment, message attachment... */
export interface PreviewableFile {
  id: number;
  display_name?: string;
  filename?: string;
  'content-type'?: string;
  content_type?: string;
  size?: number;
}

const MAX_TEXT_PREVIEW_BYTES = 512 * 1024;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load file (${res.status})`);
  const text = await res.text();
  return text.length > MAX_TEXT_PREVIEW_BYTES ? `${text.slice(0, MAX_TEXT_PREVIEW_BYTES)}\n\n… (truncated)` : text;
}

export function FilePreviewDialog({
  file,
  open,
  onOpenChange,
}: {
  file: PreviewableFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const knownType = file?.['content-type'] || file?.content_type;
  // Links inside Canvas HTML only carry an id, so look the file up when needed.
  const { data: meta, loading: metaLoading, error: metaError } = useFile(open && file && !knownType ? file.id : null);

  const name = meta?.display_name || file?.display_name || file?.filename || 'File';
  const contentType = knownType || meta?.['content-type'];
  const size = file?.size ?? meta?.size;
  const kind = contentType ? fileKind(contentType, name) : null;
  const src = file ? fileContentUrl(file.id) : '';
  const downloadHref = file ? fileContentUrl(file.id, { download: true }) : '';

  const { data: text, error: textError, isLoading: textLoading } = useSWR(
    open && kind === 'text' ? src : null,
    fetchText,
    { revalidateOnFocus: false }
  );

  let body: ReactNode;
  if (!file) {
    body = null;
  } else if (!kind && metaLoading) {
    body = <PreviewLoading />;
  } else if (metaError) {
    body = <PreviewMessage text="This file is locked or you don't have access to it." />;
  } else if (kind === 'image') {
    body = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className="mx-auto max-h-[70vh] max-w-full rounded-md object-contain" />
    );
  } else if (kind === 'pdf') {
    body = <iframe src={src} title={name} className="h-[70vh] w-full rounded-md border bg-white" />;
  } else if (kind === 'video') {
    body = <video src={src} controls className="max-h-[70vh] w-full rounded-md bg-black" />;
  } else if (kind === 'audio') {
    body = <audio src={src} controls className="w-full" />;
  } else if (kind === 'text') {
    body = textLoading ? (
      <PreviewLoading />
    ) : textError ? (
      <PreviewMessage text="Could not load this file." />
    ) : (
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-4 text-sm">
        {text}
      </pre>
    );
  } else {
    body = <PreviewMessage text="Preview isn't available for this file type. Download it to open it." />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-2rem)] flex-col sm:max-w-5xl">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="truncate">{name}</DialogTitle>
          <DialogDescription>
            {[contentType, formatFileSize(size)].filter(Boolean).join(' · ') || 'Canvas file'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto">{body}</div>

        {file && (
          <div className="flex flex-wrap justify-end gap-2">
            {kind && kind !== 'other' && (
              <Button asChild variant="outline" size="sm">
                <a href={src} target="_blank" rel="noopener noreferrer">
                  <ArrowSquareOutIcon className="mr-2 h-4 w-4" /> Open in new tab
                </a>
              </Button>
            )}
            <Button asChild size="sm">
              <a href={downloadHref}>
                <DownloadSimpleIcon className="mr-2 h-4 w-4" /> Download
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewLoading() {
  return (
    <div className="flex justify-center py-16">
      <CircleNotchIcon className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function PreviewMessage({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
      <FileDashedIcon className="h-10 w-10" />
      <p>{text}</p>
    </div>
  );
}

/**
 * Convenience hook:
 *   const { openPreview, previewDialog } = useFilePreview();
 *   <button onClick={() => openPreview(file)} />  ...  {previewDialog}
 */
export function useFilePreview() {
  const [file, setFile] = useState<PreviewableFile | null>(null);
  const previewDialog = (
    <FilePreviewDialog file={file} open={file !== null} onOpenChange={open => !open && setFile(null)} />
  );
  return { openPreview: setFile, closePreview: () => setFile(null), previewDialog };
}
