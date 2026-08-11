/**
 * Domain model. All identifiers, keys and field names are English;
 * user facing labels live in src/i18n/da.ts.
 */

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'shoulders'
  | 'side_delts'
  | 'biceps'
  | 'triceps'
  | 'calves'
  | 'core';

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'quads',
  'hamstrings',
  'glutes',
  'shoulders',
  'side_delts',
  'biceps',
  'triceps',
  'calves',
  'core',
];

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight';

export const EQUIPMENT_TYPES: Equipment[] = ['barbell', 'dumbbell', 'machine', 'bodyweight'];

/** Default smallest usable weight jump per equipment type, in kg. */
export const DEFAULT_INCREMENT_KG: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 2,
  machine: 2.5,
  bodyweight: 2.5,
};

export interface RepRange {
  min: number;
  max: number;
}

export interface Exercise {
  /** English slug, stable across renames, e.g. "romanian_deadlift". */
  id: string;
  /** Danish display name, e.g. "Rumænsk dødløft". */
  name: string;
  muscles: MuscleGroup[];
  equipment: Equipment;
  /** Smallest weight jump in kg. */
  incrementKg: number;
  defaultRepRange: RepRange;
  /** True when reps are counted per leg/arm ("8/ben"). */
  perSide: boolean;
  /** False for the built-in seed set, true for exercises the user added. */
  custom: boolean;
  createdAt: number;
}

export interface TemplateExercise {
  exerciseId: string;
  sets: number;
  repRange: RepRange;
  /**
   * Exercises sharing a non-null group in the same template are performed as a
   * superset, alternating set by set.
   */
  supersetGroup: string | null;
}

export interface WorkoutTemplate {
  id: string;
  /** Danish display name, e.g. "Full body A". */
  name: string;
  exercises: TemplateExercise[];
  /** Sort order in the picker. */
  position: number;
  updatedAt: number;
}

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface Session {
  id: string;
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  startedAt: number;
  endedAt: number | null;
  templateId: string | null;
  /** Template name as it was when the session started. */
  templateName: string;
  /**
   * Snapshot of the template's exercises taken at start, so editing the
   * template later does not rewrite a session that is already under way.
   */
  plan: TemplateExercise[];
  /** Filled when the session is finished. */
  durationMin: number | null;
  bodyWeightKg: number | null;
  sleep: Rating | null;
  energy: Rating | null;
  notes: string;
  status: 'active' | 'done';
}

/** Which kinds of personal record a set triggered, if any. */
export interface PrFlags {
  /** Heaviest working weight ever on this exercise. */
  weight?: boolean;
  /** Most reps ever at this exact weight. */
  reps?: boolean;
  /** Best estimated 1RM ever on this exercise. */
  e1rm?: boolean;
}

export interface SetLog {
  id: string;
  sessionId: string;
  exerciseId: string;
  /** 1-based, counted separately for warmup and working sets. */
  setNumber: number;
  weightKg: number;
  reps: number;
  /** Reps in reserve, 0-4. */
  rir: number | null;
  warmup: boolean;
  notes: string;
  timestamp: number;
  pr: PrFlags | null;
}

export interface BodyScan {
  id: string;
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  // Everything below is optional: only what the scale actually shows gets typed in.
  weightKg: number | null;
  bodyFatPct: number | null;
  fatMassKg: number | null;
  muscleMassKg: number | null;
  leanBodyMassKg: number | null;
  bodyWaterPct: number | null;
  visceralFat: number | null;
  boneMassKg: number | null;
  bmr: number | null;
  metabolicAge: number | null;
  /** Skeletal muscle mass index, kg/m². */
  smi: number | null;
  // Tape measurements, cm.
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  /** Progress photos as base64 data URLs, stored locally only. */
  photos: string[];
  notes: string;
  createdAt: number;
}

export interface Settings {
  id: 'settings';
  /** Weight of the empty barbell, used by the plate calculator. */
  barWeightKg: number;
  /** Plate sizes available in the gym, kg, per side. */
  availablePlatesKg: number[];
  restSecondsCompound: number;
  restSecondsSuperset: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  /** "YYYY-MM-DD" the current program block started. */
  programStartDate: string;
  /** Weekly set target per muscle group; below this the stats screen warns. */
  weeklySetTarget: number;
  seedVersion: number;
}

export const DEFAULT_SETTINGS: Omit<Settings, 'programStartDate'> = {
  id: 'settings',
  barWeightKg: 20,
  availablePlatesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  restSecondsCompound: 150,
  restSecondsSuperset: 75,
  soundEnabled: true,
  vibrationEnabled: true,
  weeklySetTarget: 6,
  seedVersion: 0,
};

/** Shape of the JSON export/import file. */
export interface BackupFile {
  format: 'strength-tracker';
  version: 1;
  exportedAt: string;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  sessions: Session[];
  setLogs: SetLog[];
  bodyScans: BodyScan[];
  settings: Settings | null;
}
