/** Epley formula: weight × (1 + reps / 30). One rep returns the weight itself. */
export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

/** Weight that Epley predicts for a target rep count from a known 1RM. */
export function weightForReps(oneRepMaxKg: number, reps: number): number {
  if (oneRepMaxKg <= 0 || reps <= 0) return 0;
  return oneRepMaxKg / (1 + reps / 30);
}
