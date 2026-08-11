import type { Exercise, TemplateExercise, WorkoutTemplate } from './types';
import { DEFAULT_INCREMENT_KG } from './types';

/** Bump when the seed content changes so existing installs pick up new exercises. */
export const SEED_VERSION = 2;

/**
 * Seed version 2 moved the display names from Danish to the English names used
 * on the gym floor. The migration only renames an exercise whose name is still
 * exactly the old seed value, so a name the user changed by hand is left alone.
 */
export const RENAMED_IN_SEED_V2: Record<string, string> = {
  bench_press: 'Bænkpres',
  romanian_deadlift: 'Rumænsk dødløft',
  lateral_raise: 'Sidehævninger',
  ez_bar_curl: 'EZ-curl',
  deadlift: 'Dødløft',
  incline_dumbbell_press: 'Skrå håndvægtspres',
  seated_shoulder_press: 'Siddende skulderpres',
  triceps_pushdown: 'Triceps pressdown',
  hip_thrust: 'Hoftestød',
  standing_calf_raise: 'Stående lægpres',
  seated_leg_curl: 'Siddende bencurl',
  leg_press: 'Benpres',
  cable_crunch: 'Kabelcrunch',
  overhead_press: 'Militærpres',
  barbell_row: 'Stangroning',
  lat_pulldown: 'Latpulldown',
};

type ExerciseSeed = Omit<Exercise, 'createdAt' | 'custom' | 'incrementKg' | 'perSide'> & {
  incrementKg?: number;
  perSide?: boolean;
};

const EXERCISE_SEEDS: ExerciseSeed[] = [
  // --- Full body A ---
  {
    id: 'back_squat',
    name: 'Back squat',
    muscles: ['quads', 'glutes', 'core'],
    equipment: 'barbell',
    defaultRepRange: { min: 5, max: 8 },
  },
  {
    id: 'bench_press',
    name: 'Bench press',
    muscles: ['chest', 'triceps', 'shoulders'],
    equipment: 'barbell',
    defaultRepRange: { min: 6, max: 8 },
  },
  {
    id: 'pull_up',
    name: 'Pull-ups',
    muscles: ['back', 'biceps'],
    equipment: 'bodyweight',
    defaultRepRange: { min: 8, max: 10 },
  },
  {
    id: 'romanian_deadlift',
    name: 'Romanian deadlift',
    muscles: ['hamstrings', 'glutes', 'back'],
    equipment: 'barbell',
    defaultRepRange: { min: 8, max: 10 },
  },
  {
    id: 'lateral_raise',
    name: 'Lateral raise',
    muscles: ['side_delts'],
    equipment: 'dumbbell',
    defaultRepRange: { min: 12, max: 15 },
  },
  {
    id: 'ez_bar_curl',
    name: 'EZ-bar curl',
    muscles: ['biceps'],
    equipment: 'barbell',
    defaultRepRange: { min: 10, max: 12 },
  },

  // --- Full body B ---
  {
    id: 'deadlift',
    name: 'Deadlift',
    muscles: ['back', 'hamstrings', 'glutes'],
    equipment: 'barbell',
    defaultRepRange: { min: 4, max: 6 },
  },
  {
    id: 'incline_dumbbell_press',
    name: 'Incline dumbbell press',
    muscles: ['chest', 'shoulders', 'triceps'],
    equipment: 'dumbbell',
    defaultRepRange: { min: 8, max: 10 },
  },
  {
    id: 'chest_supported_row',
    name: 'Chest supported row',
    muscles: ['back', 'biceps'],
    equipment: 'machine',
    defaultRepRange: { min: 8, max: 10 },
  },
  {
    id: 'bulgarian_split_squat',
    name: 'Bulgarian split squat',
    muscles: ['quads', 'glutes'],
    equipment: 'dumbbell',
    defaultRepRange: { min: 8, max: 8 },
    perSide: true,
  },
  {
    id: 'seated_shoulder_press',
    name: 'Seated shoulder press',
    muscles: ['shoulders', 'triceps'],
    equipment: 'dumbbell',
    defaultRepRange: { min: 8, max: 10 },
  },
  {
    id: 'triceps_pushdown',
    name: 'Triceps pushdown',
    muscles: ['triceps'],
    equipment: 'machine',
    defaultRepRange: { min: 10, max: 12 },
  },

  // --- Full body C ---
  {
    id: 'front_squat',
    name: 'Front squat',
    muscles: ['quads', 'glutes', 'core'],
    equipment: 'barbell',
    defaultRepRange: { min: 6, max: 8 },
  },
  {
    id: 'dip',
    name: 'Dips',
    muscles: ['chest', 'triceps'],
    equipment: 'bodyweight',
    defaultRepRange: { min: 8, max: 10 },
  },
  {
    id: 'chin_up',
    name: 'Chin-ups',
    muscles: ['back', 'biceps'],
    equipment: 'bodyweight',
    defaultRepRange: { min: 8, max: 10 },
  },
  {
    id: 'hip_thrust',
    name: 'Hip thrust',
    muscles: ['glutes', 'hamstrings'],
    equipment: 'barbell',
    defaultRepRange: { min: 8, max: 10 },
  },
  {
    id: 'walking_lunge',
    name: 'Walking lunges',
    muscles: ['quads', 'glutes'],
    equipment: 'dumbbell',
    defaultRepRange: { min: 10, max: 10 },
    perSide: true,
  },
  {
    id: 'hammer_curl',
    name: 'Hammer curl',
    muscles: ['biceps'],
    equipment: 'dumbbell',
    defaultRepRange: { min: 10, max: 12 },
  },

  // --- Extra library entries, not part of any seeded template ---
  {
    id: 'standing_calf_raise',
    name: 'Standing calf raise',
    muscles: ['calves'],
    equipment: 'machine',
    defaultRepRange: { min: 10, max: 15 },
  },
  {
    id: 'seated_leg_curl',
    name: 'Seated leg curl',
    muscles: ['hamstrings'],
    equipment: 'machine',
    defaultRepRange: { min: 10, max: 12 },
  },
  {
    id: 'leg_press',
    name: 'Leg press',
    muscles: ['quads', 'glutes'],
    equipment: 'machine',
    defaultRepRange: { min: 8, max: 12 },
  },
  {
    id: 'cable_crunch',
    name: 'Cable crunch',
    muscles: ['core'],
    equipment: 'machine',
    defaultRepRange: { min: 10, max: 15 },
  },
  {
    id: 'overhead_press',
    name: 'Overhead press',
    muscles: ['shoulders', 'triceps'],
    equipment: 'barbell',
    defaultRepRange: { min: 5, max: 8 },
  },
  {
    id: 'barbell_row',
    name: 'Barbell row',
    muscles: ['back', 'biceps'],
    equipment: 'barbell',
    defaultRepRange: { min: 6, max: 10 },
  },
  {
    id: 'lat_pulldown',
    name: 'Lat pulldown',
    muscles: ['back', 'biceps'],
    equipment: 'machine',
    defaultRepRange: { min: 8, max: 12 },
  },
  {
    id: 'face_pull',
    name: 'Face pull',
    muscles: ['side_delts', 'back'],
    equipment: 'machine',
    defaultRepRange: { min: 12, max: 15 },
  },
];

export function seedExercises(now: number): Exercise[] {
  return EXERCISE_SEEDS.map((seed) => ({
    ...seed,
    incrementKg: seed.incrementKg ?? DEFAULT_INCREMENT_KG[seed.equipment],
    perSide: seed.perSide ?? false,
    custom: false,
    createdAt: now,
  }));
}

function entry(
  exerciseId: string,
  sets: number,
  min: number,
  max: number,
  supersetGroup: string | null = null,
): TemplateExercise {
  return { exerciseId, sets, repRange: { min, max }, supersetGroup };
}

export function seedTemplates(now: number): WorkoutTemplate[] {
  return [
    {
      id: 'full_body_a',
      name: 'Full body A',
      position: 0,
      updatedAt: now,
      exercises: [
        entry('back_squat', 3, 5, 8),
        entry('bench_press', 3, 6, 8, 'A'),
        entry('pull_up', 3, 8, 10, 'A'),
        entry('romanian_deadlift', 3, 8, 10, 'B'),
        entry('lateral_raise', 3, 12, 15, 'B'),
        entry('ez_bar_curl', 3, 10, 12),
      ],
    },
    {
      id: 'full_body_b',
      name: 'Full body B',
      position: 1,
      updatedAt: now,
      exercises: [
        entry('deadlift', 3, 4, 6),
        entry('incline_dumbbell_press', 3, 8, 10, 'A'),
        entry('chest_supported_row', 3, 8, 10, 'A'),
        entry('bulgarian_split_squat', 3, 8, 8, 'B'),
        entry('seated_shoulder_press', 3, 8, 10, 'B'),
        entry('triceps_pushdown', 3, 10, 12),
      ],
    },
    {
      id: 'full_body_c',
      name: 'Full body C',
      position: 2,
      updatedAt: now,
      exercises: [
        entry('front_squat', 3, 6, 8),
        entry('dip', 3, 8, 10, 'A'),
        entry('chin_up', 3, 8, 10, 'A'),
        entry('hip_thrust', 3, 8, 10, 'B'),
        entry('walking_lunge', 3, 10, 10, 'B'),
        entry('hammer_curl', 3, 10, 12),
      ],
    },
  ];
}
