/** "Chrome 128 on macOS" style label from a user agent (works on server and client). */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  const version = (re: RegExp) => ua.match(re)?.[1];

  let browser = 'a web browser';
  if (/Edg\//.test(ua)) browser = `Edge ${version(/Edg\/(\d+)/) ?? ''}`;
  else if (/OPR\//.test(ua)) browser = `Opera ${version(/OPR\/(\d+)/) ?? ''}`;
  else if (/Firefox\//.test(ua)) browser = `Firefox ${version(/Firefox\/(\d+)/) ?? ''}`;
  else if (/CriOS\//.test(ua)) browser = `Chrome ${version(/CriOS\/(\d+)/) ?? ''}`;
  else if (/Chrome\//.test(ua)) browser = `Chrome ${version(/Chrome\/(\d+)/) ?? ''}`;
  else if (/Safari\//.test(ua)) browser = `Safari ${version(/Version\/(\d+(?:\.\d+)?)/) ?? ''}`;

  let os = '';
  if (/iPhone|iPad|iPod/.test(ua)) os = `iOS ${(version(/OS (\d+(?:_\d+)?)/) ?? '').replace('_', '.')}`;
  else if (/Android/.test(ua)) os = `Android ${version(/Android (\d+(?:\.\d+)?)/) ?? ''}`;
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  browser = browser.trim();
  os = os.trim();
  return os ? `${browser} on ${os}` : browser;
}
