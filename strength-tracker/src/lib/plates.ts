export interface PlateStack {
  plateKg: number;
  count: number;
}

export interface PlateLoad {
  /** Plates to put on one side of the bar, heaviest first. */
  perSide: PlateStack[];
  /** Weight actually reachable with the available plates. */
  achievedKg: number;
  /** False when the target cannot be hit exactly. */
  exact: boolean;
  /** True when the target is the bare bar. */
  barOnly: boolean;
}

/**
 * Greedy plate maths for a symmetric barbell. Returns null when the target is
 * lighter than the bar itself (nothing to load).
 */
export function computePlateLoad(
  targetKg: number,
  barWeightKg: number,
  availablePlatesKg: number[],
): PlateLoad | null {
  if (targetKg < barWeightKg) return null;

  const plates = [...availablePlatesKg].filter((plate) => plate > 0).sort((a, b) => b - a);
  let remainingPerSide = (targetKg - barWeightKg) / 2;
  const perSide: PlateStack[] = [];

  for (const plateKg of plates) {
    const count = Math.floor((remainingPerSide + 1e-6) / plateKg);
    if (count > 0) {
      perSide.push({ plateKg, count });
      remainingPerSide -= count * plateKg;
    }
  }

  const loadedPerSide = perSide.reduce((sum, stack) => sum + stack.plateKg * stack.count, 0);
  const achievedKg = barWeightKg + loadedPerSide * 2;

  return {
    perSide,
    achievedKg: Math.round(achievedKg * 100) / 100,
    exact: Math.abs(achievedKg - targetKg) < 0.01,
    barOnly: perSide.length === 0,
  };
}
