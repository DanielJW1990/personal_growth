import type { Session, SetLog } from '../db/types';
import type { LastPerformance } from './progression';

/**
 * The working sets from the most recent *other* session that trained this
 * exercise. Warmups are left out — the last-time line is about work sets.
 */
export function findLastPerformance(
  sets: SetLog[],
  sessionsById: Map<string, Session>,
  excludeSessionId: string | null,
): LastPerformance | null {
  const candidates = sets.filter(
    (set) => !set.warmup && set.sessionId !== excludeSessionId && sessionsById.has(set.sessionId),
  );
  if (candidates.length === 0) return null;

  let latestSessionId: string | null = null;
  let latestStart = -Infinity;
  for (const set of candidates) {
    const session = sessionsById.get(set.sessionId)!;
    if (session.startedAt > latestStart) {
      latestStart = session.startedAt;
      latestSessionId = session.id;
    }
  }
  if (!latestSessionId) return null;

  const sessionSets = candidates
    .filter((set) => set.sessionId === latestSessionId)
    .sort((a, b) => a.setNumber - b.setNumber || a.timestamp - b.timestamp);

  return {
    date: sessionsById.get(latestSessionId)!.date,
    sets: sessionSets.map((set) => ({
      setNumber: set.setNumber,
      weightKg: set.weightKg,
      reps: set.reps,
    })),
  };
}

/** Sum of weight × reps over working sets. Bodyweight sets at 0 kg add nothing. */
export function tonnage(sets: Pick<SetLog, 'weightKg' | 'reps' | 'warmup'>[]): number {
  return sets.reduce((sum, set) => (set.warmup ? sum : sum + set.weightKg * set.reps), 0);
}
