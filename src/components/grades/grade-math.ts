/**
 * Pure grade math for the grades page and the what-if calculator.
 * No React, no fetching: every function takes plain data and returns plain data.
 *
 * It mirrors how Canvas computes a student's *current* score:
 * - Only graded work counts. Ungraded, excused and "omit from final grade"
 *   assignments are left out entirely (not counted as zero).
 * - Drop rules (drop lowest / drop highest / never drop) apply per group to the
 *   counted assignments, choosing the drops that give the best / worst group
 *   percentage, the same way Canvas does.
 * - Unweighted course: total earned / total possible across every group.
 * - Weighted course: sum(groupPercent x groupWeight) / sum(weights of the groups
 *   that have any points possible), i.e. groups with nothing graded are skipped
 *   and the remaining weights are scaled up to 100. Like Canvas, the result is
 *   never scaled *down* when the counted weights add up to more than 100
 *   (an extra-credit group), so there it is simply sum(groupPercent x weight).
 */
import type { AssignmentGroup } from '@/lib/types';

export interface GradeItem {
  id: number;
  pointsPossible: number;
  /** Points earned; null means not graded yet, which Canvas leaves out of the current score. */
  score: number | null;
  excused?: boolean;
  omitFromFinal?: boolean;
}

export interface DropRules {
  dropLowest?: number;
  dropHighest?: number;
  neverDrop?: number[];
}

export interface GradeGroup {
  id: number;
  /** Group weight in percent (Canvas `group_weight`); ignored for unweighted courses. */
  weight: number;
  rules?: DropRules;
  items: GradeItem[];
}

export interface GroupGrade {
  id: number;
  weight: number;
  earned: number;
  possible: number;
  /** 0-100, or null when the group has no points possible yet. */
  percent: number | null;
  /** Ids of items that count toward the group (after drops). */
  countedIds: number[];
  /** Ids of graded items removed by the group's drop rules. */
  droppedIds: number[];
}

export interface CourseGrade {
  /** 0-100, or null when nothing has been graded. */
  percent: number | null;
  weighted: boolean;
  groups: GroupGrade[];
  /** Weighted courses: total weight of the groups that took part (the divisor). */
  weightUsed: number;
}

/** Map of assignment id -> what-if score (points). */
export type ScoreOverrides = Record<number, number>;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** A graded, non-excused, non-omitted item: the only kind that affects the grade. */
export function isCounted(item: GradeItem): item is GradeItem & { score: number } {
  return item.score !== null && Number.isFinite(item.score) && !item.excused && !item.omitFromFinal;
}

type ScoredItem = GradeItem & { score: number };

function subsetRatio(items: ScoredItem[]): number {
  const earned = sum(items.map(i => i.score));
  const possible = sum(items.map(i => i.pointsPossible));
  if (possible > 0) return earned / possible;
  return earned > 0 ? Infinity : 0;
}

function compareNumbers(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Chooses `keep` items whose combined earned/possible is as high (goal 'highest')
 * or as low (goal 'lowest') as possible. Uses Dinkelbach's iteration: for a
 * candidate ratio q, the best subset is the top-k of (score - q * possible); repeat
 * with that subset's ratio until it stops improving. Canvas binary-searches the
 * same q, so both land on the same subset.
 */
function pickKept(items: ScoredItem[], keep: number, goal: 'highest' | 'lowest'): ScoredItem[] {
  const k = Math.max(1, keep);
  if (items.length <= k) return items;
  const direction = goal === 'highest' ? -1 : 1;
  const takeBy = (key: (item: ScoredItem) => number) =>
    [...items].sort((a, b) => direction * compareNumbers(key(a), key(b)) || a.id - b.id).slice(0, k);

  // Start from the items with the best (or worst) individual percentages.
  let kept = takeBy(item =>
    item.pointsPossible > 0 ? item.score / item.pointsPossible : item.score > 0 ? Infinity : 0
  );
  let q = subsetRatio(kept);
  for (let step = 0; step < 100 && Number.isFinite(q); step++) {
    const next = takeBy(item => item.score - q * item.pointsPossible);
    const nextQ = subsetRatio(next);
    const improved = goal === 'highest' ? nextQ > q + 1e-12 : nextQ < q - 1e-12;
    if (!improved) break;
    kept = next;
    q = nextQ;
  }
  return kept;
}

/** Applies a group's drop rules to its counted items. */
export function applyDropRules(items: ScoredItem[], rules?: DropRules): { kept: ScoredItem[]; dropped: ScoredItem[] } {
  let dropLowest = Math.max(0, Math.floor(rules?.dropLowest ?? 0));
  let dropHighest = Math.max(0, Math.floor(rules?.dropHighest ?? 0));
  if (!dropLowest && !dropHighest) return { kept: items, dropped: [] };

  const neverDrop = new Set(rules?.neverDrop ?? []);
  const locked = items.filter(item => neverDrop.has(item.id));
  const droppable = items.filter(item => !neverDrop.has(item.id));
  if (droppable.length === 0) return { kept: items, dropped: [] };

  // Canvas always keeps at least one droppable item.
  if (dropLowest >= droppable.length) {
    dropLowest = droppable.length - 1;
    dropHighest = 0;
  }
  if (dropHighest >= droppable.length) {
    dropHighest = droppable.length - 1;
    dropLowest = 0;
  }

  const keepAfterLowest = droppable.length - dropLowest;
  const keepAfterHighest = keepAfterLowest - dropHighest;
  let kept = pickKept(droppable, keepAfterLowest, 'highest');
  kept = pickKept(kept, keepAfterHighest, 'lowest');

  const keptIds = new Set(kept.map(item => item.id));
  return {
    kept: [...kept, ...locked],
    dropped: droppable.filter(item => !keptIds.has(item.id)),
  };
}

export function computeGroupGrade(group: GradeGroup): GroupGrade {
  const counted = group.items.filter(isCounted);
  const { kept, dropped } = applyDropRules(counted, group.rules);
  const earned = sum(kept.map(item => item.score));
  const possible = sum(kept.map(item => item.pointsPossible));
  return {
    id: group.id,
    weight: group.weight,
    earned,
    possible,
    percent: possible > 0 ? (earned / possible) * 100 : null,
    countedIds: kept.map(item => item.id),
    droppedIds: dropped.map(item => item.id),
  };
}

/**
 * Course percentage.
 *   unweighted: sum(earned) / sum(possible) x 100
 *   weighted:   sum(groupPercent x weight) / sum(weight), over groups with possible > 0;
 *               the division is skipped when those weights already total 100 or more.
 */
export function computeCourseGrade(groups: GradeGroup[], weighted: boolean): CourseGrade {
  const results = groups.map(computeGroupGrade);

  if (!weighted) {
    const earned = sum(results.map(g => g.earned));
    const possible = sum(results.map(g => g.possible));
    return {
      percent: possible > 0 ? (earned / possible) * 100 : null,
      weighted,
      groups: results,
      weightUsed: 0,
    };
  }

  const relevant = results.filter(g => g.possible > 0);
  const weightUsed = sum(relevant.map(g => g.weight));
  const weightedSum = sum(relevant.map(g => (g.earned / g.possible) * 100 * g.weight));
  let percent: number | null = null;
  if (relevant.length > 0 && weightUsed > 0) {
    percent = weightUsed < 100 ? weightedSum / weightUsed : weightedSum / 100;
  }
  return { percent, weighted, groups: results, weightUsed };
}

/**
 * Converts Canvas assignment groups (with `assignments` + `submission`) into math input.
 * An override replaces the Canvas score and also un-excuses the assignment.
 */
export function toGradeGroups(groups: AssignmentGroup[], overrides: ScoreOverrides = {}): GradeGroup[] {
  return groups.map(group => ({
    id: group.id,
    weight: group.group_weight ?? 0,
    rules: {
      dropLowest: group.rules?.drop_lowest,
      dropHighest: group.rules?.drop_highest,
      neverDrop: group.rules?.never_drop,
    },
    items: (group.assignments ?? []).map(assignment => {
      const override = overrides[assignment.id];
      const hasOverride = override !== undefined && Number.isFinite(override);
      return {
        id: assignment.id,
        pointsPossible: assignment.points_possible ?? 0,
        score: hasOverride ? override : (assignment.submission?.score ?? null),
        excused: hasOverride ? false : Boolean(assignment.submission?.excused),
        omitFromFinal: Boolean(assignment.omit_from_final_grade),
      };
    }),
  }));
}

/** Parses the raw text of the what-if inputs; blank or invalid entries are ignored. */
export function parseOverrides(raw: Record<number, string>): ScoreOverrides {
  const parsed: ScoreOverrides = {};
  for (const [id, text] of Object.entries(raw)) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    const value = Number(trimmed);
    if (Number.isFinite(value) && value >= 0) parsed[Number(id)] = value;
  }
  return parsed;
}

/** "92.35%" (up to two decimals, like Canvas), or the fallback for null. */
export function formatPercent(value: number | null | undefined, fallback = '--'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return `${Number(value.toFixed(2))}%`;
}

/** "12.5" style points (up to two decimals). */
export function formatPoints(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return String(Number(value.toFixed(2)));
}
