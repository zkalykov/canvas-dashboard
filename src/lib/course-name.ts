/**
 * Readable course names. Canvas course codes are often cut short by the school
 * ("Operating Syste"), while the full name carries the code as a prefix
 * ("CS1301(1)-Intro to Programming"). Show the name without the prefix, and the
 * prefix as the code.
 */

type CourseLike = { name?: string | null; course_code?: string | null };

// "CS1301(1)-", "HIST 1301 - ", "MATH1314:", "BIO-101 |"
const CODE_PREFIX = /^\s*([A-Z]{2,6}[\s-]?\d{3,5}[A-Z]?)(?:\s?\(\d+\))?\s*[-–—:|]\s*/;

export function courseTitle(course: CourseLike | null | undefined): string {
  if (!course) return 'Course';
  const name = course.name?.trim() || '';
  const stripped = name.replace(CODE_PREFIX, '').trim();
  return stripped || name || course.course_code?.trim() || 'Course';
}

/** Short code like "CS1301", or null when there isn't a useful one. */
export function courseCode(course: CourseLike | null | undefined): string | null {
  if (!course) return null;
  const match = course.name?.match(CODE_PREFIX);
  if (match) return match[1].replace(/\s+/g, '');
  const code = course.course_code?.trim();
  const title = courseTitle(course);
  return code && !title.toLowerCase().startsWith(code.toLowerCase()) ? code : null;
}
