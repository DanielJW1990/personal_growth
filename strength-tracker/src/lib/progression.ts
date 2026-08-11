import type { RepRange } from '../db/types';

export interface PerformedSet {
  setNumber: number;
  weightKg: number;
  reps: number;
}

export interface LastPerformance {
  /** "YYYY-MM-DD" of the session the sets come from. */
  date: string;
  /** Working sets only, in the order they were performed. */
  sets: PerformedSet[];
}

export type SuggestionReason = 'first_time' | 'increase_weight' | 'add_rep';

export interface SetTarget {
  weightKg: number;
  reps: number;
}

export interface Suggestion {
  reason: SuggestionReason;
  /** One target per planned set. */
  targets: SetTarget[];
  incrementKg: number;
}

/**
 * Double progression.
 *
 * Hit the top of the rep range on every working set last time → add one weight
 * increment and drop back to the bottom of the range. Otherwise keep the weight
 * and chase one more rep per set, capped at the top of the range.
 */
export function suggestTargets(
  last: LastPerformance | null,
  plannedSets: number,
  range: RepRange,
  incrementKg: number,
): Suggestion {
  const sets = Math.max(1, plannedSets);

  if (!last || last.sets.length === 0) {
    return {
      reason: 'first_time',
      targets: Array.from({ length: sets }, () => ({ weightKg: 0, reps: range.min })),
      incrementKg,
    };
  }

  const hitTopOnEverySet = last.sets.every((set) => set.reps >= range.max);

  if (hitTopOnEverySet) {
    const heaviest = Math.max(...last.sets.map((set) => set.weightKg));
    const weightKg = roundToIncrement(heaviest + incrementKg, incrementKg);
    return {
      reason: 'increase_weight',
      targets: Array.from({ length: sets }, () => ({ weightKg, reps: range.min })),
      incrementKg,
    };
  }

  const targets = Array.from({ length: sets }, (_unused, index) => {
    // Extra sets beyond what was done last time reuse the final set as reference.
    const source = last.sets[index] ?? last.sets[last.sets.length - 1];
    return {
      weightKg: source.weightKg,
      reps: Math.min(source.reps + 1, range.max),
    };
  });

  return { reason: 'add_rep', targets, incrementKg };
}

/** Snaps a weight to the nearest usable multiple of the increment. */
export function roundToIncrement(weightKg: number, incrementKg: number): number {
  if (incrementKg <= 0) return weightKg;
  return Math.round((Math.round(weightKg / incrementKg) * incrementKg + Number.EPSILON) * 100) / 100;
}

/** "80 kg x 8, 80 x 7, 80 x 6" — the last-time line at the top of an exercise. */
export function formatPerformedSets(sets: PerformedSet[]): string {
  if (sets.length === 0) return '';
  return sets
    .map((set, index) => {
      const weight = formatWeight(set.weightKg);
      return index === 0 ? `${weight} kg x ${set.reps}` : `${weight} x ${set.reps}`;
    })
    .join(', ');
}

function formatWeight(weightKg: number): string {
  const rounded = Math.round(weightKg * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}
