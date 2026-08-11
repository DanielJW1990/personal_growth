import type { Exercise, MuscleGroup, Session, SetLog } from '../db/types';
import { addDays, daysBetween, fromIsoDate, isoWeekLabel, startOfWeek, toIsoDate } from './date';
import { epley1RM } from './oneRepMax';

/**
 * Consecutive weeks with at least one session, counted backwards. The current
 * week only breaks the streak once it is over, so a quiet Monday costs nothing.
 */
export function computeWeekStreak(sessionDates: string[], todayIso: string): number {
  if (sessionDates.length === 0) return 0;
  const weeks = new Set(sessionDates.map(startOfWeek));

  let cursor = startOfWeek(todayIso);
  if (!weeks.has(cursor)) {
    cursor = addDays(cursor, -7);
    if (!weeks.has(cursor)) return 0;
  }

  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

export function sessionsInMonth(sessionDates: string[], todayIso: string): number {
  const prefix = todayIso.slice(0, 7);
  return sessionDates.filter((date) => date.startsWith(prefix)).length;
}

/** Whole weeks since the program block started, 1-based ("uge 1" on day one). */
export function weeksOnProgram(programStartDate: string, todayIso: string): number {
  const days = daysBetween(programStartDate, todayIso);
  if (days < 0) return 1;
  return Math.floor(days / 7) + 1;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

/**
 * Best estimated 1RM per training day for one exercise, oldest first.
 * Taking the day's best set keeps back-off sets from making the line jagged.
 */
export function e1rmSeries(
  sets: SetLog[],
  sessionsById: Map<string, Session>,
  exerciseId: string,
): SeriesPoint[] {
  const bestByDate = new Map<string, number>();
  for (const set of sets) {
    if (set.exerciseId !== exerciseId || set.warmup || set.reps <= 0) continue;
    const session = sessionsById.get(set.sessionId);
    if (!session) continue;
    const value = epley1RM(set.weightKg, set.reps);
    if (value <= 0) continue;
    bestByDate.set(session.date, Math.max(bestByDate.get(session.date) ?? 0, value));
  }
  return [...bestByDate.entries()]
    .map(([date, value]) => ({ date, value: Math.round(value * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface Trend {
  /** Change per week in the series unit. */
  slopePerWeek: number;
  /** Predicts the value at a given date; used to draw the trend line. */
  predict: (date: string) => number;
}

/** Least squares fit over time. Returns null for fewer than two points. */
export function linearTrend(points: SeriesPoint[]): Trend | null {
  if (points.length < 2) return null;

  const baseline = fromIsoDate(points[0].date).getTime();
  const xs = points.map((point) => (fromIsoDate(point.date).getTime() - baseline) / 86_400_000);
  const ys = points.map((point) => point.value);
  const n = points.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }
  if (denominator === 0) return null;

  const slopePerDay = numerator / denominator;
  const intercept = meanY - slopePerDay * meanX;

  return {
    slopePerWeek: slopePerDay * 7,
    predict: (date: string) =>
      intercept + slopePerDay * ((fromIsoDate(date).getTime() - baseline) / 86_400_000),
  };
}

/**
 * Centred-to-trailing moving average over calendar days: each point averages
 * every reading in the preceding window, which is what flattens daily noise in
 * body weight.
 */
export function movingAverage(points: SeriesPoint[], windowDays: number): SeriesPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((point) => {
    const from = addDays(point.date, -(windowDays - 1));
    const window = sorted.filter((item) => item.date >= from && item.date <= point.date);
    const average = window.reduce((sum, item) => sum + item.value, 0) / window.length;
    return { date: point.date, value: Math.round(average * 100) / 100 };
  });
}

export interface SessionTonnage {
  date: string;
  sessionId: string;
  value: number;
}

export function tonnagePerSession(sets: SetLog[], sessions: Session[]): SessionTonnage[] {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const totals = new Map<string, number>();
  for (const set of sets) {
    if (set.warmup) continue;
    totals.set(set.sessionId, (totals.get(set.sessionId) ?? 0) + set.weightKg * set.reps);
  }
  return [...totals.entries()]
    .filter(([sessionId]) => byId.has(sessionId))
    .map(([sessionId, value]) => ({
      sessionId,
      date: byId.get(sessionId)!.date,
      value: Math.round(value),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface WeekBucket {
  week: string;
  value: number;
}

export function tonnagePerWeek(perSession: SessionTonnage[]): WeekBucket[] {
  const totals = new Map<string, number>();
  for (const item of perSession) {
    const week = isoWeekLabel(item.date);
    totals.set(week, (totals.get(week) ?? 0) + item.value);
  }
  return [...totals.entries()]
    .map(([week, value]) => ({ week, value: Math.round(value) }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Working sets counted per muscle group over the last `days` days. An exercise
 * hitting three muscles counts one set towards each of them.
 */
export function setsPerMuscleGroup(
  sets: SetLog[],
  sessions: Session[],
  exercises: Exercise[],
  todayIso: string,
  days = 7,
): Record<MuscleGroup, number> {
  const from = addDays(todayIso, -(days - 1));
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const counts = {} as Record<MuscleGroup, number>;

  for (const set of sets) {
    if (set.warmup) continue;
    const session = sessionsById.get(set.sessionId);
    if (!session || session.date < from || session.date > todayIso) continue;
    const exercise = exerciseById.get(set.exerciseId);
    if (!exercise) continue;
    for (const muscle of exercise.muscles) {
      counts[muscle] = (counts[muscle] ?? 0) + 1;
    }
  }

  return counts;
}

/** Latest session date, or null. */
export function lastSessionDate(sessions: Session[], templateId?: string): string | null {
  const relevant = sessions
    .filter((session) => session.status === 'done')
    .filter((session) => (templateId ? session.templateId === templateId : true))
    .sort((a, b) => b.startedAt - a.startedAt);
  return relevant[0]?.date ?? null;
}

/** Today as an ISO date; kept here so screens have one import for stats helpers. */
export function today(): string {
  return toIsoDate(new Date());
}
