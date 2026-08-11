import Dexie, { type Table } from 'dexie';
import type { BodyScan, Exercise, Session, SetLog, Settings, WorkoutTemplate } from './types';
import { DEFAULT_SETTINGS } from './types';
import { RENAMED_IN_SEED_V2, SEED_VERSION, seedExercises, seedTemplates } from './seed';
import { todayIso } from '../lib/date';

export class StrengthDb extends Dexie {
  exercises!: Table<Exercise, string>;
  templates!: Table<WorkoutTemplate, string>;
  sessions!: Table<Session, string>;
  setLogs!: Table<SetLog, string>;
  bodyScans!: Table<BodyScan, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'strength_tracker') {
    super(name);
    this.version(1).stores({
      exercises: 'id, name, equipment',
      templates: 'id, position',
      sessions: 'id, date, status, templateId',
      setLogs: 'id, sessionId, exerciseId, timestamp, [exerciseId+timestamp]',
      bodyScans: 'id, date',
      settings: 'id',
    });
  }
}

export const db = new StrengthDb();

/**
 * Creates the built-in exercises, templates and settings on first run.
 * Re-running is safe: existing rows are never overwritten, so edits survive.
 */
export async function ensureSeeded(database: StrengthDb = db): Promise<void> {
  const now = Date.now();
  await database.transaction(
    'rw',
    database.exercises,
    database.templates,
    database.settings,
    async () => {
      const current = await database.settings.get('settings');

      if (!current) {
        await database.settings.put({
          ...DEFAULT_SETTINGS,
          programStartDate: todayIso(),
          seedVersion: SEED_VERSION,
        });
      }

      // Only add exercises that are missing; user edits to existing ones stand.
      const existingExerciseIds = new Set(await database.exercises.toCollection().primaryKeys());
      const missingExercises = seedExercises(now).filter((e) => !existingExerciseIds.has(e.id));
      if (missingExercises.length > 0) {
        await database.exercises.bulkAdd(missingExercises);
      }

      // Templates are only seeded when the user has none at all, so a deleted
      // template does not silently reappear on the next launch.
      const templateCount = await database.templates.count();
      if (templateCount === 0 && (!current || current.seedVersion === 0)) {
        await database.templates.bulkAdd(seedTemplates(now));
      }

      if (current && current.seedVersion < 2) {
        await renameSeedExercisesToEnglish(database);
      }

      if (current && current.seedVersion !== SEED_VERSION) {
        await database.settings.put({ ...current, seedVersion: SEED_VERSION });
      }
    },
  );
}

/**
 * Seed version 2 switched the built-in exercises to their English names.
 * Only exercises still carrying the exact old Danish seed name are renamed,
 * so anything the user renamed themselves is left untouched. Set logs and
 * templates reference exercises by id, so nothing else has to change.
 */
async function renameSeedExercisesToEnglish(database: StrengthDb): Promise<void> {
  const seedsById = new Map(seedExercises(Date.now()).map((seed) => [seed.id, seed]));

  for (const [exerciseId, oldDanishName] of Object.entries(RENAMED_IN_SEED_V2)) {
    const stored = await database.exercises.get(exerciseId);
    const seed = seedsById.get(exerciseId);
    if (!stored || !seed || stored.custom || stored.name !== oldDanishName) continue;
    await database.exercises.update(exerciseId, { name: seed.name });
  }
}

/** Short, sortable, collision-safe enough for a single-user local database. */
export function newId(prefix = ''): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${random}`;
}
