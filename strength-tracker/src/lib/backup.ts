import { db } from '../db/db';
import type { BackupFile, Exercise, SetLog } from '../db/types';

export interface ImportCounts {
  exercises: number;
  templates: number;
  sessions: number;
  setLogs: number;
  bodyScans: number;
}

export async function buildBackup(): Promise<BackupFile> {
  const [exercises, templates, sessions, setLogs, bodyScans, settings] = await Promise.all([
    db.exercises.toArray(),
    db.templates.toArray(),
    db.sessions.toArray(),
    db.setLogs.toArray(),
    db.bodyScans.toArray(),
    db.settings.get('settings'),
  ]);

  return {
    format: 'strength-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises,
    templates,
    sessions,
    setLogs,
    bodyScans,
    settings: settings ?? null,
  };
}

/** Validates enough of the shape to refuse an unrelated JSON file. */
export function parseBackup(text: string): BackupFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Partial<BackupFile>;
  if (candidate.format !== 'strength-tracker') return null;

  const arrays: (keyof BackupFile)[] = [
    'exercises',
    'templates',
    'sessions',
    'setLogs',
    'bodyScans',
  ];
  if (!arrays.every((key) => Array.isArray(candidate[key]))) return null;

  return candidate as BackupFile;
}

/**
 * `replace` wipes everything first; `merge` keeps what is already there and
 * overwrites only rows whose id appears in the file.
 */
export async function importBackup(
  backup: BackupFile,
  mode: 'replace' | 'merge',
): Promise<ImportCounts> {
  await db.transaction(
    'rw',
    [db.exercises, db.templates, db.sessions, db.setLogs, db.bodyScans, db.settings],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.exercises.clear(),
          db.templates.clear(),
          db.sessions.clear(),
          db.setLogs.clear(),
          db.bodyScans.clear(),
        ]);
      }

      await db.exercises.bulkPut(backup.exercises);
      await db.templates.bulkPut(backup.templates);
      await db.sessions.bulkPut(backup.sessions);
      await db.setLogs.bulkPut(backup.setLogs);
      await db.bodyScans.bulkPut(backup.bodyScans);
      if (backup.settings) await db.settings.put(backup.settings);
    },
  );

  return {
    exercises: backup.exercises.length,
    templates: backup.templates.length,
    sessions: backup.sessions.length,
    setLogs: backup.setLogs.length,
    bodyScans: backup.bodyScans.length,
  };
}

/**
 * Set log as CSV. Comma separated with dot decimals — the portable form; open
 * it with "from text/CSV" in a Danish Excel rather than double clicking.
 */
export function setLogsToCsv(
  setLogs: SetLog[],
  sessions: { id: string; date: string; templateName: string }[],
  exercises: Exercise[],
): string {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  const header = [
    'date',
    'session_id',
    'template',
    'exercise_id',
    'exercise_name',
    'set_number',
    'weight_kg',
    'reps',
    'rir',
    'warmup',
    'estimated_1rm',
    'pr',
    'notes',
  ];

  const rows = [...setLogs]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((set) => {
      const session = sessionsById.get(set.sessionId);
      const exercise = exercisesById.get(set.exerciseId);
      const e1rm = set.reps > 0 ? set.weightKg * (1 + set.reps / 30) : 0;
      const prFlags = set.pr
        ? Object.entries(set.pr)
            .filter(([, value]) => value)
            .map(([key]) => key)
            .join(' ')
        : '';
      return [
        session?.date ?? '',
        set.sessionId,
        session?.templateName ?? '',
        set.exerciseId,
        exercise?.name ?? '',
        set.setNumber,
        set.weightKg,
        set.reps,
        set.rir ?? '',
        set.warmup ? 'yes' : 'no',
        e1rm.toFixed(2),
        prFlags,
        set.notes,
      ];
    });

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Triggers a local file download. Nothing leaves the device. */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a tick to start the download before dropping the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function backupFilename(prefix: string, extension: string): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return `${prefix}-${stamp}.${extension}`;
}
