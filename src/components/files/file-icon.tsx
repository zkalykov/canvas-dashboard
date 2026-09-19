'use client';

import { FileAudioIcon, FileCodeIcon, FileIcon as FileGlyph, FileImageIcon, FileTextIcon, FileVideoIcon, FileXlsIcon, FileZipIcon, PresentationIcon } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { fileKind } from '@/lib/files';
import { cn } from '@/lib/utils';

type IconKey = 'image' | 'pdf' | 'video' | 'audio' | 'doc' | 'sheet' | 'slides' | 'archive' | 'code' | 'text' | 'other';

const ICONS: Record<IconKey, { icon: PhosphorIcon; color: string }> = {
  image: { icon: FileImageIcon, color: 'text-emerald-600 dark:text-emerald-400' },
  pdf: { icon: FileTextIcon, color: 'text-red-600 dark:text-red-400' },
  video: { icon: FileVideoIcon, color: 'text-violet-600 dark:text-violet-400' },
  audio: { icon: FileAudioIcon, color: 'text-pink-600 dark:text-pink-400' },
  doc: { icon: FileTextIcon, color: 'text-blue-600 dark:text-blue-400' },
  sheet: { icon: FileXlsIcon, color: 'text-green-600 dark:text-green-400' },
  slides: { icon: PresentationIcon, color: 'text-orange-600 dark:text-orange-400' },
  archive: { icon: FileZipIcon, color: 'text-amber-600 dark:text-amber-400' },
  code: { icon: FileCodeIcon, color: 'text-sky-600 dark:text-sky-400' },
  text: { icon: FileTextIcon, color: 'text-muted-foreground' },
  other: { icon: FileGlyph, color: 'text-muted-foreground' },
};

const EXTENSIONS: [IconKey, string[]][] = [
  ['doc', ['doc', 'docx', 'odt', 'rtf', 'pages']],
  ['sheet', ['xls', 'xlsx', 'ods', 'numbers', 'csv', 'tsv']],
  ['slides', ['ppt', 'pptx', 'odp', 'key']],
  ['archive', ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2']],
  ['code', ['html', 'htm', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'h', 'cpp', 'cs', 'rb', 'go', 'rs', 'json', 'xml', 'css', 'sql', 'ipynb', 'r', 'm', 'sh']],
  ['image', ['svg', 'heic', 'tif', 'tiff']],
];

function iconKey(contentType: string | undefined | null, name: string): IconKey {
  const ext = name.includes('.') ? name.toLowerCase().split('.').pop() || '' : '';
  for (const [key, extensions] of EXTENSIONS) {
    if (extensions.includes(ext)) return key;
  }
  const kind = fileKind(contentType, name);
  if (kind !== 'other') return kind;
  const type = (contentType || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.includes('zip') || type.includes('compressed')) return 'archive';
  if (type.includes('word') || type.includes('opendocument.text')) return 'doc';
  if (type.includes('sheet') || type.includes('excel')) return 'sheet';
  if (type.includes('presentation') || type.includes('powerpoint')) return 'slides';
  return 'other';
}

/** Icon for a Canvas file, picked from its content type and extension. */
export function FileIcon({
  contentType,
  name,
  className,
}: {
  contentType: string | undefined | null;
  name: string;
  className?: string;
}) {
  const { icon: Icon, color } = ICONS[iconKey(contentType, name)];
  return <Icon className={cn('h-5 w-5 shrink-0', color, className)} aria-hidden="true" />;
}
