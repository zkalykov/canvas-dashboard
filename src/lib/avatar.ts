/**
 * A Canvas profile picture URL, or undefined when the person has no picture of
 * their own (Canvas then returns its grey placeholder image).
 */
export function usableAvatar(url: string | null | undefined): string | undefined {
  if (!url || /\/images\/(messages\/avatar-|dotted_pic)/.test(url)) return undefined;
  return url;
}
