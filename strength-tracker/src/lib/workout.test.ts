import { describe, expect, it } from 'vitest';
import { buildBlocks, isSuperset } from './blocks';
import { findLastPerformance } from './history';
import { computeWeekStreak, linearTrend, movingAverage, weeksOnProgram } from './stats';
import type { Session, SetLog, TemplateExercise } from '../db/types';

const entry = (
  exerciseId: string,
  supersetGroup: string | null = null,
): TemplateExercise => ({ exerciseId, sets: 3, repRange: { min: 8, max: 10 }, supersetGroup });

describe('buildBlocks', () => {
  it('groups consecutive superset entries and leaves singles alone', () => {
    const blocks = buildBlocks([
      entry('back_squat'),
      entry('bench_press', 'A'),
      entry('pull_up', 'A'),
      entry('romanian_deadlift', 'B'),
      entry('lateral_raise', 'B'),
      entry('ez_bar_curl'),
    ]);

    expect(blocks).toHaveLength(4);
    expect(blocks.map((block) => block.entries.length)).toEqual([1, 2, 2, 1]);
    expect(isSuperset(blocks[1])).toBe(true);
    expect(isSuperset(blocks[0])).toBe(false);
  });

  it('starts a new block when a group reappears later', () => {
    const blocks = buildBlocks([entry('a', 'A'), entry('b', 'A'), entry('c'), entry('d', 'A')]);
    expect(blocks).toHaveLength(3);
    expect(blocks[2].entries.map((item) => item.exerciseId)).toEqual(['d']);
  });
});

describe('findLastPerformance', () => {
  const sessions: Session[] = [
    makeSession('s1', '2026-07-28', 1),
    makeSession('s2', '2026-08-04', 2),
    makeSession('s3', '2026-08-11', 3),
  ];
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));

  const sets: SetLog[] = [
    makeSet('s1', 'back_squat', 1, 75, 8),
    makeSet('s2', 'back_squat', 1, 80, 8),
    makeSet('s2', 'back_squat', 2, 80, 7),
    makeSet('s2', 'back_squat', 3, 80, 6),
    makeSet('s2', 'back_squat', 1, 40, 10, true),
    makeSet('s3', 'back_squat', 1, 82.5, 5),
  ];

  it('returns the previous session, not the one being logged', () => {
    const last = findLastPerformance(sets, sessionsById, 's3');
    expect(last?.date).toBe('2026-08-04');
    expect(last?.sets.map((set) => set.reps)).toEqual([8, 7, 6]);
  });

  it('leaves warmups out', () => {
    const last = findLastPerformance(sets, sessionsById, 's3');
    expect(last?.sets.every((set) => set.weightKg === 80)).toBe(true);
  });

  it('returns null when the exercise is new', () => {
    expect(findLastPerformance([], sessionsById, 's3')).toBeNull();
  });
});

describe('computeWeekStreak', () => {
  it('counts consecutive weeks', () => {
    expect(computeWeekStreak(['2026-08-10', '2026-08-03', '2026-07-27'], '2026-08-11')).toBe(3);
  });

  it('does not break on a quiet start to the current week', () => {
    expect(computeWeekStreak(['2026-08-06', '2026-07-30'], '2026-08-11')).toBe(2);
  });

  it('breaks after a missed week', () => {
    expect(computeWeekStreak(['2026-07-20'], '2026-08-11')).toBe(0);
  });
});

describe('movingAverage', () => {
  it('smooths daily noise', () => {
    const points = [
      { date: '2026-08-01', value: 80 },
      { date: '2026-08-02', value: 82 },
      { date: '2026-08-03', value: 78 },
    ];
    const smoothed = movingAverage(points, 7);
    expect(smoothed[0].value).toBe(80);
    expect(smoothed[2].value).toBe(80);
  });
});

describe('linearTrend', () => {
  it('reports kg per week', () => {
    const trend = linearTrend([
      { date: '2026-08-01', value: 100 },
      { date: '2026-08-08', value: 105 },
      { date: '2026-08-15', value: 110 },
    ]);
    expect(trend?.slopePerWeek).toBeCloseTo(5, 5);
    expect(trend?.predict('2026-08-22')).toBeCloseTo(115, 5);
  });

  it('needs at least two points', () => {
    expect(linearTrend([{ date: '2026-08-01', value: 100 }])).toBeNull();
  });
});

describe('weeksOnProgram', () => {
  it('starts at week 1 on day one', () => {
    expect(weeksOnProgram('2026-08-11', '2026-08-11')).toBe(1);
    expect(weeksOnProgram('2026-08-11', '2026-08-17')).toBe(1);
    expect(weeksOnProgram('2026-08-11', '2026-08-18')).toBe(2);
  });
});

function makeSession(id: string, date: string, order: number): Session {
  return {
    id,
    date,
    startedAt: order * 1000,
    endedAt: order * 1000 + 100,
    templateId: 'full_body_a',
    templateName: 'Full body A',
    plan: [],
    durationMin: 60,
    bodyWeightKg: null,
    sleep: null,
    energy: null,
    notes: '',
    status: 'done',
  };
}

function makeSet(
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  weightKg: number,
  reps: number,
  warmup = false,
): SetLog {
  return {
    id: `${sessionId}-${exerciseId}-${setNumber}-${warmup ? 'w' : 's'}`,
    sessionId,
    exerciseId,
    setNumber,
    weightKg,
    reps,
    rir: null,
    warmup,
    notes: '',
    timestamp: setNumber,
    pr: null,
  };
}
