import { describe, expect, it } from 'vitest';
import { formatPerformedSets, suggestTargets } from './progression';
import { computePlateLoad } from './plates';
import { buildBests, detectPr } from './pr';
import { epley1RM } from './oneRepMax';

const range = { min: 6, max: 8 };

describe('suggestTargets', () => {
  it('asks for a starting weight the first time', () => {
    const suggestion = suggestTargets(null, 3, range, 2.5);
    expect(suggestion.reason).toBe('first_time');
    expect(suggestion.targets).toHaveLength(3);
    expect(suggestion.targets[0]).toEqual({ weightKg: 0, reps: 6 });
  });

  it('adds weight and resets reps when the top was hit on every set', () => {
    const last = {
      date: '2026-08-04',
      sets: [
        { setNumber: 1, weightKg: 80, reps: 8 },
        { setNumber: 2, weightKg: 80, reps: 8 },
        { setNumber: 3, weightKg: 80, reps: 8 },
      ],
    };
    const suggestion = suggestTargets(last, 3, range, 2.5);
    expect(suggestion.reason).toBe('increase_weight');
    expect(suggestion.targets).toEqual([
      { weightKg: 82.5, reps: 6 },
      { weightKg: 82.5, reps: 6 },
      { weightKg: 82.5, reps: 6 },
    ]);
  });

  it('keeps the weight and chases one more rep when a set fell short', () => {
    const last = {
      date: '2026-08-04',
      sets: [
        { setNumber: 1, weightKg: 80, reps: 8 },
        { setNumber: 2, weightKg: 80, reps: 7 },
        { setNumber: 3, weightKg: 80, reps: 6 },
      ],
    };
    const suggestion = suggestTargets(last, 3, range, 2.5);
    expect(suggestion.reason).toBe('add_rep');
    expect(suggestion.targets).toEqual([
      { weightKg: 80, reps: 8 },
      { weightKg: 80, reps: 8 },
      { weightKg: 80, reps: 7 },
    ]);
  });

  it('uses the dumbbell increment when told to', () => {
    const last = { date: '2026-08-04', sets: [{ setNumber: 1, weightKg: 22, reps: 10 }] };
    const suggestion = suggestTargets(last, 3, { min: 8, max: 10 }, 2);
    expect(suggestion.targets[0].weightKg).toBe(24);
  });

  it('reuses the last set as reference for extra sets', () => {
    const last = { date: '2026-08-04', sets: [{ setNumber: 1, weightKg: 60, reps: 6 }] };
    const suggestion = suggestTargets(last, 3, range, 2.5);
    expect(suggestion.targets).toHaveLength(3);
    expect(suggestion.targets[2]).toEqual({ weightKg: 60, reps: 7 });
  });

  it('treats a fixed rep target as its own top of range', () => {
    const last = { date: '2026-08-04', sets: [{ setNumber: 1, weightKg: 20, reps: 8 }] };
    const suggestion = suggestTargets(last, 3, { min: 8, max: 8 }, 2);
    expect(suggestion.reason).toBe('increase_weight');
    expect(suggestion.targets[0]).toEqual({ weightKg: 22, reps: 8 });
  });
});

describe('formatPerformedSets', () => {
  it('writes the last-time line', () => {
    const line = formatPerformedSets([
      { setNumber: 1, weightKg: 80, reps: 8 },
      { setNumber: 2, weightKg: 80, reps: 7 },
      { setNumber: 3, weightKg: 80, reps: 6 },
    ]);
    expect(line).toBe('80 kg x 8, 80 x 7, 80 x 6');
  });

  it('uses a Danish decimal comma', () => {
    expect(formatPerformedSets([{ setNumber: 1, weightKg: 82.5, reps: 5 }])).toBe('82,5 kg x 5');
  });
});

describe('computePlateLoad', () => {
  const plates = [25, 20, 15, 10, 5, 2.5, 1.25];

  it('loads 100 kg with the heaviest plates that fit', () => {
    const load = computePlateLoad(100, 20, plates);
    expect(load?.perSide).toEqual([
      { plateKg: 25, count: 1 },
      { plateKg: 15, count: 1 },
    ]);
    expect(load?.exact).toBe(true);
  });

  it('handles half-plate targets', () => {
    const load = computePlateLoad(82.5, 20, plates);
    expect(load?.perSide).toEqual([
      { plateKg: 25, count: 1 },
      { plateKg: 5, count: 1 },
      { plateKg: 1.25, count: 1 },
    ]);
    expect(load?.achievedKg).toBe(82.5);
  });

  it('flags the bare bar', () => {
    expect(computePlateLoad(20, 20, plates)?.barOnly).toBe(true);
  });

  it('reports the nearest weight when the target is unreachable', () => {
    const load = computePlateLoad(81, 20, plates);
    expect(load?.exact).toBe(false);
    expect(load?.achievedKg).toBe(80);
  });

  it('returns null below bar weight', () => {
    expect(computePlateLoad(15, 20, plates)).toBeNull();
  });
});

describe('detectPr', () => {
  const history = [
    { weightKg: 80, reps: 8, warmup: false },
    { weightKg: 80, reps: 7, warmup: false },
    { weightKg: 120, reps: 1, warmup: false },
  ];

  it('flags a new heaviest weight', () => {
    const pr = detectPr({ weightKg: 125, reps: 1, warmup: false }, buildBests(history));
    expect(pr?.weight).toBe(true);
  });

  it('flags more reps at a weight already used', () => {
    const pr = detectPr({ weightKg: 80, reps: 9, warmup: false }, buildBests(history));
    expect(pr?.reps).toBe(true);
    expect(pr?.weight).toBeUndefined();
  });

  it('flags a better estimated 1RM without a weight PR', () => {
    // 110 x 6 estimates 132 kg, beating the 120 x 1 single (124 kg).
    const pr = detectPr({ weightKg: 110, reps: 6, warmup: false }, buildBests(history));
    expect(pr?.e1rm).toBe(true);
    expect(pr?.weight).toBeUndefined();
  });

  it('ignores warmup sets and non-records', () => {
    expect(detectPr({ weightKg: 200, reps: 5, warmup: true }, buildBests(history))).toBeNull();
    expect(detectPr({ weightKg: 80, reps: 5, warmup: false }, buildBests(history))).toBeNull();
  });
});

describe('epley1RM', () => {
  it('returns the weight itself for a single', () => {
    expect(epley1RM(100, 1)).toBeCloseTo(103.33, 2);
  });

  it('scales with reps', () => {
    expect(epley1RM(80, 8)).toBeCloseTo(101.33, 2);
  });
});
