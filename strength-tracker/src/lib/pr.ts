import type { PrFlags, SetLog } from '../db/types';
import { epley1RM } from './oneRepMax';

/** Rolling bests for one exercise, built from every working set logged so far. */
export interface ExerciseBests {
  bestWeightKg: number;
  bestE1rm: number;
  /** Highest rep count seen at each exact weight. */
  bestRepsByWeight: Map<number, number>;
}

export function emptyBests(): ExerciseBests {
  return { bestWeightKg: 0, bestE1rm: 0, bestRepsByWeight: new Map() };
}

export function buildBests(sets: Pick<SetLog, 'weightKg' | 'reps' | 'warmup'>[]): ExerciseBests {
  const bests = emptyBests();
  for (const set of sets) {
    if (set.warmup) continue;
    applyToBests(bests, set);
  }
  return bests;
}

export function applyToBests(bests: ExerciseBests, set: { weightKg: number; reps: number }): void {
  if (set.reps <= 0) return;
  bests.bestWeightKg = Math.max(bests.bestWeightKg, set.weightKg);
  bests.bestE1rm = Math.max(bests.bestE1rm, epley1RM(set.weightKg, set.reps));
  const previousReps = bests.bestRepsByWeight.get(set.weightKg) ?? 0;
  if (set.reps > previousReps) bests.bestRepsByWeight.set(set.weightKg, set.reps);
}

/**
 * Compares a set against the bests recorded *before* it. Returns null when the
 * set beats nothing. Bodyweight sets at 0 kg only compete on reps.
 */
export function detectPr(
  set: { weightKg: number; reps: number; warmup: boolean },
  bests: ExerciseBests,
): PrFlags | null {
  if (set.warmup || set.reps <= 0) return null;

  const flags: PrFlags = {};

  if (set.weightKg > 0 && set.weightKg > bests.bestWeightKg) flags.weight = true;

  const previousRepsAtWeight = bests.bestRepsByWeight.get(set.weightKg);
  // Only a rep PR if the weight has been used before; a brand new weight is
  // already covered by the weight PR (or is simply the first data point).
  if (previousRepsAtWeight !== undefined && set.reps > previousRepsAtWeight) flags.reps = true;

  const e1rm = epley1RM(set.weightKg, set.reps);
  if (e1rm > 0 && e1rm > bests.bestE1rm + 1e-9) flags.e1rm = true;

  return Object.keys(flags).length > 0 ? flags : null;
}
