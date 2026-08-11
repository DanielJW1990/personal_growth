import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import { seedTemplates } from '../db/seed';
import {
  DEFAULT_INCREMENT_KG,
  EQUIPMENT_TYPES,
  MUSCLE_GROUPS,
  type Equipment,
  type Exercise,
  type MuscleGroup,
  type TemplateExercise,
  type WorkoutTemplate,
} from '../db/types';
import { da, equipmentLabels, muscleGroupLabels, t } from '../i18n/da';
import { EmptyState, SectionTitle, Segmented, Sheet, Toggle } from '../components/ui';
import { formatKg } from '../lib/format';

type Section = 'templates' | 'exercises';

export function ProgramScreen() {
  const [section, setSection] = useState<Section>('templates');

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-4 text-2xl font-bold">{da.program.title}</h1>
      <Segmented
        value={section}
        onChange={setSection}
        options={[
          { value: 'templates', label: da.program.templates },
          { value: 'exercises', label: da.program.exercises },
        ]}
      />
      <div className="mt-4">
        {section === 'templates' ? <TemplateList /> : <ExerciseList />}
      </div>
    </div>
  );
}

/** "3 x 8-10" or "3 x 8" when the range is fixed. */
export function formatSetScheme(entry: Pick<TemplateExercise, 'sets' | 'repRange'>): string {
  const { min, max } = entry.repRange;
  return min === max ? `${entry.sets} x ${min}` : `${entry.sets} x ${min}-${max}`;
}

function TemplateList() {
  const templates = useLiveQuery(() => db.templates.orderBy('position').toArray(), [], undefined);
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);
  const [editing, setEditing] = useState<WorkoutTemplate | null>(null);

  const exerciseById = useMemo(
    () => new Map((exercises ?? []).map((exercise) => [exercise.id, exercise])),
    [exercises],
  );

  if (!templates || !exercises) return null;

  const createTemplate = async () => {
    const template: WorkoutTemplate = {
      id: newId('tpl_'),
      name: da.program.newTemplate,
      exercises: [],
      position: templates.length,
      updatedAt: Date.now(),
    };
    await db.templates.put(template);
    setEditing(template);
  };

  const restoreSeed = async () => {
    const existing = new Set(templates.map((template) => template.id));
    const missing = seedTemplates(Date.now()).filter((template) => !existing.has(template.id));
    if (missing.length > 0) await db.templates.bulkPut(missing);
  };

  return (
    <div className="space-y-3">
      {templates.length === 0 ? <EmptyState>{da.common.noData}</EmptyState> : null}

      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          className="card w-full text-left active:scale-[0.99]"
          onClick={() => setEditing(template)}
        >
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-bold">{template.name}</h3>
            <span className="text-sm text-slate-400">
              {template.exercises.length} {da.program.exercises.toLowerCase()}
            </span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {template.exercises.map((entry, index) => (
              <li key={`${entry.exerciseId}-${index}`} className="flex justify-between gap-3">
                <span className="truncate">
                  {entry.supersetGroup ? (
                    <span className="mr-1 rounded bg-ink-600 px-1 text-xs text-accent">
                      {entry.supersetGroup}
                    </span>
                  ) : null}
                  {exerciseById.get(entry.exerciseId)?.name ?? entry.exerciseId}
                </span>
                <span className="shrink-0 tabular-nums text-slate-400">
                  {formatSetScheme(entry)}
                </span>
              </li>
            ))}
          </ul>
        </button>
      ))}

      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={createTemplate}>
          {da.program.newTemplate}
        </button>
        <button type="button" className="btn-ghost flex-1" onClick={restoreSeed}>
          {da.settings.reseed}
        </button>
      </div>

      {editing ? (
        <TemplateEditor
          template={editing}
          exercises={exercises}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function TemplateEditor({
  template,
  exercises,
  onClose,
}: {
  template: WorkoutTemplate;
  exercises: Exercise[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<WorkoutTemplate>(template);
  const [picking, setPicking] = useState(false);

  const exerciseById = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises],
  );

  const update = (index: number, patch: Partial<TemplateExercise>) => {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.exercises.length) return;
    const next = [...draft.exercises];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, exercises: next });
  };

  const addExercise = (exercise: Exercise) => {
    setDraft((current) => ({
      ...current,
      exercises: [
        ...current.exercises,
        {
          exerciseId: exercise.id,
          sets: 3,
          repRange: { ...exercise.defaultRepRange },
          supersetGroup: null,
        },
      ],
    }));
    setPicking(false);
  };

  const save = async () => {
    await db.templates.put({ ...draft, updatedAt: Date.now() });
    onClose();
  };

  const remove = async () => {
    if (!confirm(da.common.confirmDelete)) return;
    await db.templates.delete(draft.id);
    onClose();
  };

  const supersetOptions = ['A', 'B', 'C', 'D'];

  return (
    <Sheet
      open
      onClose={onClose}
      title={da.program.editTemplate}
      footer={
        <div className="flex gap-2">
          <button type="button" className="btn-danger px-4" onClick={remove}>
            {da.common.delete}
          </button>
          <button type="button" className="btn-primary flex-1" onClick={save}>
            {da.common.save}
          </button>
        </div>
      }
    >
      <label className="block">
        <span className="label">{da.program.templateName}</span>
        <input
          className="field"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </label>

      <SectionTitle>{da.program.exercises}</SectionTitle>
      <div className="space-y-3">
        {draft.exercises.map((entry, index) => (
          <div key={`${entry.exerciseId}-${index}`} className="rounded-xl bg-ink-700 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold">
                {exerciseById.get(entry.exerciseId)?.name ?? entry.exerciseId}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={da.program.moveUp}
                  className="btn btn-ghost h-10 min-h-[40px] w-10 px-0"
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={da.program.moveDown}
                  className="btn btn-ghost h-10 min-h-[40px] w-10 px-0"
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={da.program.remove}
                  className="btn btn-danger h-10 min-h-[40px] w-10 px-0"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      exercises: draft.exercises.filter((_entry, i) => i !== index),
                    })
                  }
                >
                  ×
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label>
                <span className="label">{da.program.setsLabel}</span>
                <input
                  className="field"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={entry.sets}
                  onChange={(event) =>
                    update(index, { sets: Math.max(1, Number(event.target.value) || 1) })
                  }
                />
              </label>
              <label>
                <span className="label">{da.program.repRange} min</span>
                <input
                  className="field"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={entry.repRange.min}
                  onChange={(event) =>
                    update(index, {
                      repRange: {
                        ...entry.repRange,
                        min: Math.max(1, Number(event.target.value) || 1),
                      },
                    })
                  }
                />
              </label>
              <label>
                <span className="label">{da.program.repRange} max</span>
                <input
                  className="field"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={entry.repRange.max}
                  onChange={(event) =>
                    update(index, {
                      repRange: {
                        ...entry.repRange,
                        max: Math.max(1, Number(event.target.value) || 1),
                      },
                    })
                  }
                />
              </label>
            </div>

            <div className="mt-2">
              <span className="label">{da.program.supersetGroup}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => update(index, { supersetGroup: null })}
                  className={`btn h-10 min-h-[40px] flex-1 text-sm ${
                    entry.supersetGroup === null ? 'bg-accent text-ink-900' : 'bg-ink-600'
                  }`}
                >
                  {da.program.noSuperset}
                </button>
                {supersetOptions.map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => update(index, { supersetGroup: group })}
                    className={`btn h-10 min-h-[40px] w-12 px-0 text-sm ${
                      entry.supersetGroup === group ? 'bg-accent text-ink-900' : 'bg-ink-600'
                    }`}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setPicking(true)}>
        {da.program.addExercise}
      </button>

      {picking ? (
        <ExercisePicker exercises={exercises} onPick={addExercise} onClose={() => setPicking(false)} />
      ) : null}
    </Sheet>
  );
}

export function ExercisePicker({
  exercises,
  onPick,
  onClose,
}: {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = exercises
    .filter((exercise) => exercise.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'da'));

  return (
    <Sheet open onClose={onClose} title={da.program.addExercise}>
      <input
        className="field mb-3"
        placeholder={da.program.exerciseName}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="space-y-2">
        {filtered.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            className="flex min-h-[56px] w-full items-center justify-between rounded-xl bg-ink-700 px-3 text-left"
            onClick={() => onPick(exercise)}
          >
            <span className="font-medium">{exercise.name}</span>
            <span className="text-xs text-slate-400">{equipmentLabels[exercise.equipment]}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function ExerciseList() {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);
  const [query, setQuery] = useState('');

  if (!exercises) return null;

  const filtered = exercises
    .filter((exercise) => exercise.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'da'));

  return (
    <div>
      <input
        className="field mb-3"
        placeholder={da.program.exerciseName}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="space-y-2">
        {filtered.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            className="card flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setEditing(exercise)}
          >
            <div className="min-w-0">
              <div className="truncate font-semibold">{exercise.name}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {exercise.muscles.map((muscle) => (
                  <span key={muscle} className="chip bg-ink-600 text-slate-300">
                    {muscleGroupLabels[muscle]}
                  </span>
                ))}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs text-slate-400">
              <div>{equipmentLabels[exercise.equipment]}</div>
              <div>+{formatKg(exercise.incrementKg)} kg</div>
            </div>
          </button>
        ))}
      </div>

      <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setEditing('new')}>
        {da.program.newExercise}
      </button>

      {editing ? (
        <ExerciseEditor
          exercise={editing === 'new' ? null : editing}
          allExercises={exercises}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function ExerciseEditor({
  exercise,
  allExercises,
  onClose,
}: {
  exercise: Exercise | null;
  allExercises: Exercise[];
  onClose: () => void;
}) {
  const isNew = exercise === null;
  const [draft, setDraft] = useState<Exercise>(
    exercise ?? {
      id: '',
      name: '',
      muscles: [],
      equipment: 'barbell',
      incrementKg: DEFAULT_INCREMENT_KG.barbell,
      defaultRepRange: { min: 8, max: 10 },
      perSide: false,
      custom: true,
      createdAt: Date.now(),
    },
  );
  const [idTouched, setIdTouched] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [usageCount, setUsageCount] = useState<number | null>(null);

  const templates = useLiveQuery(() => db.templates.toArray(), [], undefined);
  const usedInTemplates = (templates ?? []).filter((template) =>
    template.exercises.some((entry) => entry.exerciseId === draft.id),
  ).length;

  const setName = (name: string) => {
    setDraft((current) => ({
      ...current,
      name,
      id: idTouched ? current.id : slugify(name),
    }));
  };

  const toggleMuscle = (muscle: MuscleGroup) => {
    setDraft((current) => ({
      ...current,
      muscles: current.muscles.includes(muscle)
        ? current.muscles.filter((item) => item !== muscle)
        : [...current.muscles, muscle],
    }));
  };

  const setEquipment = (equipment: Equipment) => {
    setDraft((current) => ({
      ...current,
      equipment,
      // Follow the equipment default until the user overrides it by hand.
      incrementKg: DEFAULT_INCREMENT_KG[equipment],
    }));
  };

  const save = async () => {
    if (draft.name.trim() === '') return setError(da.program.nameRequired);
    if (!/^[a-z0-9_]+$/.test(draft.id)) return setError(da.program.idInvalid);
    if (draft.muscles.length === 0) return setError(da.program.muscleRequired);
    if (isNew && allExercises.some((item) => item.id === draft.id)) {
      return setError(da.program.idTaken);
    }
    await db.exercises.put({ ...draft, name: draft.name.trim() });
    onClose();
  };

  const remove = async () => {
    const logged = await db.setLogs.where('exerciseId').equals(draft.id).count();
    if (logged > 0) {
      setUsageCount(logged);
      return setError(da.program.deleteExerciseBlocked);
    }
    if (!confirm(da.common.confirmDelete)) return;
    await db.exercises.delete(draft.id);
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? da.program.newExercise : da.program.editExercise}
      footer={
        <div className="flex gap-2">
          {!isNew ? (
            <button type="button" className="btn-danger px-4" onClick={remove}>
              {da.common.delete}
            </button>
          ) : null}
          <button type="button" className="btn-primary flex-1" onClick={save}>
            {da.common.save}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">{da.program.exerciseName}</span>
          <input className="field" value={draft.name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="block">
          <span className="label">{da.program.exerciseId}</span>
          <input
            className="field font-mono text-sm"
            value={draft.id}
            disabled={!isNew}
            onChange={(event) => {
              setIdTouched(true);
              setDraft({ ...draft, id: event.target.value });
            }}
          />
        </label>

        <div>
          <span className="label">{da.program.muscles}</span>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_GROUPS.map((muscle) => (
              <button
                key={muscle}
                type="button"
                onClick={() => toggleMuscle(muscle)}
                className={`btn h-11 min-h-[44px] px-3 text-sm ${
                  draft.muscles.includes(muscle) ? 'bg-accent text-ink-900' : 'bg-ink-700'
                }`}
              >
                {muscleGroupLabels[muscle]}
              </button>
            ))}
          </div>
        </div>

        <Segmented
          label={da.program.equipment}
          value={draft.equipment}
          onChange={setEquipment}
          options={EQUIPMENT_TYPES.map((equipment) => ({
            value: equipment,
            label: equipmentLabels[equipment],
          }))}
        />

        <label className="block">
          <span className="label">{da.program.increment}</span>
          <input
            className="field"
            type="number"
            inputMode="decimal"
            step="0.25"
            value={draft.incrementKg}
            onChange={(event) =>
              setDraft({ ...draft, incrementKg: Number(event.target.value) || 0 })
            }
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">{da.program.defaultReps} min</span>
            <input
              className="field"
              type="number"
              inputMode="numeric"
              value={draft.defaultRepRange.min}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  defaultRepRange: {
                    ...draft.defaultRepRange,
                    min: Math.max(1, Number(event.target.value) || 1),
                  },
                })
              }
            />
          </label>
          <label>
            <span className="label">{da.program.defaultReps} max</span>
            <input
              className="field"
              type="number"
              inputMode="numeric"
              value={draft.defaultRepRange.max}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  defaultRepRange: {
                    ...draft.defaultRepRange,
                    max: Math.max(1, Number(event.target.value) || 1),
                  },
                })
              }
            />
          </label>
        </div>

        <Toggle
          label={da.program.perSide}
          checked={draft.perSide}
          onChange={(perSide) => setDraft({ ...draft, perSide })}
        />

        {usedInTemplates > 0 ? (
          <p className="text-sm text-slate-400">
            {t(da.program.usedInTemplates, { count: usedInTemplates })}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl bg-bad/15 p-3 text-sm text-bad">
            {error}
            {usageCount ? ` (${usageCount} ${da.common.sets})` : ''}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
