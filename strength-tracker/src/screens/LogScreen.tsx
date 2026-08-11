import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import type { Exercise, PrFlags, Session, SetLog, Settings, TemplateExercise } from '../db/types';
import { da, t } from '../i18n/da';
import { buildBlocks, isSuperset, type WorkoutBlock } from '../lib/blocks';
import { findLastPerformance, tonnage } from '../lib/history';
import { formatPerformedSets, suggestTargets } from '../lib/progression';
import { buildBests, detectPr } from '../lib/pr';
import { computePlateLoad } from '../lib/plates';
import { epley1RM } from '../lib/oneRepMax';
import { formatClock, formatShortDate } from '../lib/date';
import { formatKg, formatKgUnit, formatTonnage } from '../lib/format';
import { primeAudio, playBeep, vibrate } from '../lib/feedback';
import { useRestTimer } from '../hooks/useRestTimer';
import { RatingPicker, Sheet, Stepper } from '../components/ui';

interface LogScreenProps {
  session: Session;
  settings: Settings;
  onFinished: () => void;
}

export function LogScreen({ session, settings, onFinished }: LogScreenProps) {
  const blocks = useMemo(() => buildBlocks(session.plan), [session.plan]);
  const [blockIndex, setBlockIndex] = useState(0);
  const [entryIndex, setEntryIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const timer = useRestTimer(() => {
    if (settings.soundEnabled) playBeep();
    if (settings.vibrationEnabled) vibrate();
  });

  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);
  const sessionSets = useLiveQuery(
    () => db.setLogs.where('sessionId').equals(session.id).toArray(),
    [session.id],
    undefined,
  );

  const block = blocks[Math.min(blockIndex, Math.max(0, blocks.length - 1))];
  const entry = block?.entries[Math.min(entryIndex, block.entries.length - 1)];

  if (!exercises || !sessionSets) return null;

  if (!block || !entry) {
    return (
      <div className="px-4 pt-6">
        <p className="card text-slate-300">{da.log.noExercises}</p>
        <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setFinishing(true)}>
          {da.log.finish}
        </button>
        {finishing ? (
          <FinishSheet
            session={session}
            sessionSets={sessionSets}
            onClose={() => setFinishing(false)}
            onFinished={onFinished}
          />
        ) : null}
      </div>
    );
  }

  const exercise = exercises.find((item) => item.id === entry.exerciseId);
  const totalSets = session.plan.reduce((sum, item) => sum + item.sets, 0);
  const doneSets = sessionSets.filter((set) => !set.warmup).length;

  const goToBlock = (index: number) => {
    setBlockIndex(Math.min(blocks.length - 1, Math.max(0, index)));
    setEntryIndex(0);
  };

  return (
    <div className="pb-40">
      <header className="sticky top-0 z-30 border-b border-ink-600 bg-ink-900/95 px-4 py-3 backdrop-blur safe-top">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{session.templateName}</div>
            <div className="text-xs text-slate-400">
              <ElapsedTime startedAt={session.startedAt} /> ·{' '}
              {t(da.log.setsDone, { done: doneSets, total: totalSets })} ·{' '}
              {formatTonnage(tonnage(sessionSets))}
            </div>
          </div>
          <button type="button" className="btn-ghost px-3" onClick={() => setFinishing(true)}>
            {da.log.finish}
          </button>
        </div>

        <div className="mt-3 flex gap-1">
          {blocks.map((item, index) => (
            <button
              key={item.key}
              type="button"
              aria-label={`${index + 1}`}
              onClick={() => goToBlock(index)}
              className={`h-1.5 flex-1 rounded-full transition ${
                index === blockIndex
                  ? 'bg-accent'
                  : blockIsDone(item, sessionSets)
                    ? 'bg-good/70'
                    : 'bg-ink-600'
              }`}
            />
          ))}
        </div>
      </header>

      <div className="px-4 pt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span>{t(da.log.exerciseOf, { current: blockIndex + 1, total: blocks.length })}</span>
          {isSuperset(block) ? (
            <span className="chip bg-accent/15 text-accent">
              {t(da.log.superset, { group: block.supersetGroup ?? '' })}
            </span>
          ) : null}
        </div>

        {isSuperset(block) ? (
          <div className="mb-3">
            <div className="flex gap-1 rounded-xl bg-ink-700 p-1">
              {block.entries.map((item, index) => {
                const itemExercise = exercises.find((e) => e.id === item.exerciseId);
                const done = sessionSets.filter(
                  (set) => set.exerciseId === item.exerciseId && !set.warmup,
                ).length;
                return (
                  <button
                    key={item.exerciseId}
                    type="button"
                    onClick={() => setEntryIndex(index)}
                    className={`min-h-[52px] flex-1 rounded-lg px-2 text-sm font-semibold leading-tight transition ${
                      index === entryIndex ? 'bg-accent text-ink-900' : 'text-slate-300'
                    }`}
                  >
                    <span className="block truncate">{itemExercise?.name ?? item.exerciseId}</span>
                    <span className="text-xs font-normal opacity-80">
                      {done}/{item.sets}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-center text-xs text-slate-500">{da.log.supersetHint}</p>
          </div>
        ) : null}

        {exercise ? (
          <ExercisePanel
            key={`${exercise.id}-${blockIndex}`}
            exercise={exercise}
            entry={entry}
            session={session}
            settings={settings}
            sessionSets={sessionSets}
            restSeconds={
              isSuperset(block) ? settings.restSecondsSuperset : settings.restSecondsCompound
            }
            onSetSaved={() => {
              // In a superset the next set belongs to the other exercise.
              if (isSuperset(block)) {
                setEntryIndex((current) => (current + 1) % block.entries.length);
              }
            }}
            startRest={timer.start}
          />
        ) : (
          <p className="card text-slate-400">{entry.exerciseId}</p>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            className="btn-ghost flex-1"
            disabled={blockIndex === 0}
            onClick={() => goToBlock(blockIndex - 1)}
          >
            ← {da.log.prevExercise}
          </button>
          <button
            type="button"
            className="btn-secondary flex-1"
            disabled={blockIndex >= blocks.length - 1}
            onClick={() => goToBlock(blockIndex + 1)}
          >
            {da.log.nextExercise} →
          </button>
        </div>
      </div>

      <RestTimerBar timer={timer} />

      {finishing ? (
        <FinishSheet
          session={session}
          sessionSets={sessionSets}
          onClose={() => setFinishing(false)}
          onFinished={onFinished}
        />
      ) : null}
    </div>
  );
}

function blockIsDone(block: WorkoutBlock, sessionSets: SetLog[]): boolean {
  return block.entries.every((entry) => {
    const done = sessionSets.filter(
      (set) => set.exerciseId === entry.exerciseId && !set.warmup,
    ).length;
    return done >= entry.sets;
  });
}

function ElapsedTime({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, []);
  return <span className="tabular-nums">{formatClock((now - startedAt) / 1000)}</span>;
}

interface ExercisePanelProps {
  exercise: Exercise;
  entry: TemplateExercise;
  session: Session;
  settings: Settings;
  sessionSets: SetLog[];
  restSeconds: number;
  onSetSaved: () => void;
  startRest: (seconds: number) => void;
}

function ExercisePanel({
  exercise,
  entry,
  session,
  settings,
  sessionSets,
  restSeconds,
  onSetSaved,
  startRest,
}: ExercisePanelProps) {
  const historySets = useLiveQuery(
    () => db.setLogs.where('exerciseId').equals(exercise.id).toArray(),
    [exercise.id],
    undefined,
  );
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], undefined);

  const [warmup, setWarmup] = useState(false);
  const [weightKg, setWeightKg] = useState(0);
  const [reps, setReps] = useState(entry.repRange.min);
  const [rir, setRir] = useState<number | null>(null);
  const [justSaved, setJustSaved] = useState<PrFlags | null | 'saved'>(null);

  const mySets = sessionSets
    .filter((set) => set.exerciseId === exercise.id)
    .sort((a, b) => a.timestamp - b.timestamp);
  const workingSets = mySets.filter((set) => !set.warmup);
  const nextSetNumber = (warmup ? mySets.filter((s) => s.warmup).length : workingSets.length) + 1;

  const last = useMemo(() => {
    if (!historySets || !sessions) return null;
    return findLastPerformance(
      historySets,
      new Map(sessions.map((item) => [item.id, item])),
      session.id,
    );
  }, [historySets, sessions, session.id]);

  const suggestion = useMemo(
    () => suggestTargets(last, entry.sets, entry.repRange, exercise.incrementKg),
    [last, entry.sets, entry.repRange, exercise.incrementKg],
  );

  const target =
    suggestion.targets[Math.min(nextSetNumber - 1, suggestion.targets.length - 1)] ??
    suggestion.targets[0];

  // Reload the prefilled values whenever the pending set changes. The key also
  // covers the history arriving late, so the first set is not prefilled from an
  // empty (and therefore weightless) suggestion.
  const dataReady = Boolean(historySets && sessions);
  const draftKey = `${exercise.id}:${warmup ? 'w' : 's'}:${nextSetNumber}:${dataReady ? 1 : 0}`;
  const lastDraftKey = useRef<string | null>(null);
  useEffect(() => {
    if (!dataReady || lastDraftKey.current === draftKey) return;
    lastDraftKey.current = draftKey;
    const previous = workingSets[workingSets.length - 1];

    if (warmup) {
      // A warmup starts from something light rather than the working target.
      const base = previous?.weightKg ?? target?.weightKg ?? 0;
      setWeightKg(roundTo(base * 0.5, exercise.incrementKg));
      setReps(Math.max(5, entry.repRange.min));
    } else if (previous) {
      // Follow what actually went on the bar today, even when that deviates
      // from the suggestion, and keep chasing the target reps for this set.
      setWeightKg(previous.weightKg);
      setReps(suggestion.reason === 'first_time' ? previous.reps : (target?.reps ?? previous.reps));
    } else {
      setWeightKg(target?.weightKg ?? 0);
      setReps(target?.reps ?? entry.repRange.min);
    }
    setRir(null);
  }, [
    dataReady,
    draftKey,
    warmup,
    target,
    suggestion.reason,
    entry.repRange.min,
    exercise.incrementKg,
    workingSets,
  ]);

  if (!historySets || !sessions) return null;

  const bests = buildBests(historySets);
  const plate =
    exercise.equipment === 'barbell'
      ? computePlateLoad(weightKg, settings.barWeightKg, settings.availablePlatesKg)
      : null;

  const saveSet = async () => {
    const pr = detectPr({ weightKg, reps, warmup }, bests);
    const set: SetLog = {
      id: newId('set_'),
      sessionId: session.id,
      exerciseId: exercise.id,
      setNumber: nextSetNumber,
      weightKg,
      reps,
      rir,
      warmup,
      notes: '',
      timestamp: Date.now(),
      pr,
    };
    primeAudio();
    await db.setLogs.add(set);
    setJustSaved(pr ?? 'saved');
    window.setTimeout(() => setJustSaved(null), 2500);
    if (!warmup) startRest(restSeconds);
    if (settings.vibrationEnabled) vibrate(40);
    if (!warmup) onSetSaved();
  };

  const undoLast = async () => {
    const latest = mySets[mySets.length - 1];
    if (latest) await db.setLogs.delete(latest.id);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold leading-tight">{exercise.name}</h2>
        <p className="text-sm text-slate-400">
          {entry.sets} x {entry.repRange.min}
          {entry.repRange.max !== entry.repRange.min ? `-${entry.repRange.max}` : ''}
          {exercise.perSide ? ` ${da.log.perSide}` : ''}
        </p>
      </div>

      {/* Last time — the first thing to read when stepping up to the bar. */}
      <div className="card bg-ink-800/80">
        {last ? (
          <>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {t(da.log.lastTimeOn, { date: formatShortDate(last.date) })}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {formatPerformedSets(last.sets)}
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-400">{da.log.lastTimeNever}</div>
        )}

        <div className="mt-3 border-t border-ink-600 pt-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">{da.log.suggestion}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-accent tabular-nums">
              {suggestion.reason === 'first_time'
                ? '—'
                : `${formatKg(target?.weightKg ?? 0)} kg x ${target?.reps ?? entry.repRange.min}`}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {suggestion.reason === 'increase_weight'
              ? t(da.log.suggestionProgress, { increment: formatKg(suggestion.incrementKg) })
              : suggestion.reason === 'add_rep'
                ? da.log.suggestionSameWeight
                : da.log.suggestionFirstTime}
          </p>
        </div>
      </div>

      {/* Stacked rather than side by side: full width keeps the +/- buttons
          big enough to hit without looking at the screen. */}
      <div className="space-y-3">
        <Stepper
          label={`${da.log.weight} (${da.common.kg})`}
          value={weightKg}
          onChange={setWeightKg}
          step={exercise.incrementKg}
          bigStep={exercise.incrementKg * 4}
          format={formatKg}
          suffix={da.common.kg}
        />
        <Stepper
          label={da.log.reps + (exercise.perSide ? ` (${da.log.perSide})` : '')}
          ariaLabel={da.log.reps}
          value={reps}
          onChange={setReps}
          step={1}
          min={1}
          max={100}
        />
      </div>

      <div>
        <span className="label">
          {da.log.rir} <span className="text-slate-500">({da.log.rirHint})</span>
        </span>
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRir(rir === value ? null : value)}
              className={`btn h-11 min-h-[44px] flex-1 ${
                rir === value ? 'bg-accent text-ink-900' : 'bg-ink-700 text-slate-300'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setWarmup(!warmup)}
        className={`btn h-11 min-h-[44px] w-full text-sm ${
          warmup ? 'bg-warn/20 text-warn ring-1 ring-inset ring-warn/40' : 'bg-ink-700 text-slate-300'
        }`}
      >
        {warmup ? `✓ ${da.log.warmup}` : da.log.warmup}
      </button>

      {plate ? (
        <div className="rounded-xl bg-ink-800 p-3 text-sm ring-1 ring-ink-600/60">
          <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">{da.log.plates}</div>
          {plate.barOnly ? (
            <span className="text-slate-300">
              {t(da.log.platesBarOnly, { bar: formatKg(settings.barWeightKg) })}
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {plate.perSide.map((stack) => (
                <span
                  key={stack.plateKg}
                  className="chip bg-accent/15 text-accent tabular-nums"
                >
                  {stack.count} × {formatKg(stack.plateKg)}
                </span>
              ))}
              <span className="text-xs text-slate-500">
                {t(da.log.platesTotal, { total: formatKg(plate.achievedKg) })}
              </span>
            </div>
          )}
          {!plate.exact ? (
            <p className="mt-1 text-xs text-warn">
              {t(da.log.platesImpossible, { actual: formatKg(plate.achievedKg) })}
            </p>
          ) : null}
        </div>
      ) : null}

      <button type="button" className="btn-primary w-full text-lg" onClick={saveSet}>
        {t(da.log.setNumber, { number: nextSetNumber })} · {da.log.saveSet}
      </button>

      {justSaved && justSaved !== 'saved' ? (
        <div className="rounded-xl bg-good/15 p-3 text-center text-sm font-semibold text-good">
          {[
            justSaved.weight ? da.log.prWeight : null,
            justSaved.reps ? t(da.log.prReps, { weight: formatKg(weightKg) }) : null,
            justSaved.e1rm ? da.log.prE1rm : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      ) : null}

      {mySets.length > 0 ? (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label mb-0">{da.common.sets}</span>
            <button type="button" className="text-sm text-slate-400 underline" onClick={undoLast}>
              {da.log.undo}
            </button>
          </div>
          <ul className="space-y-1">
            {mySets.map((set) => (
              <li
                key={set.id}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                  set.warmup ? 'bg-ink-800 text-slate-400' : 'bg-ink-700'
                }`}
              >
                <span className="tabular-nums">
                  {set.warmup ? `${da.log.warmup} · ` : `${set.setNumber}. `}
                  {formatKgUnit(set.weightKg)} × {set.reps}
                  {set.rir !== null ? ` · RIR ${set.rir}` : ''}
                </span>
                <span className="flex items-center gap-2">
                  {set.pr ? <span className="chip bg-good/20 text-good">{da.log.prShort}</span> : null}
                  {!set.warmup ? (
                    <span className="text-xs text-slate-500 tabular-nums">
                      {formatKg(epley1RM(set.weightKg, set.reps))}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

function RestTimerBar({ timer }: { timer: ReturnType<typeof useRestTimer> }) {
  if (!timer.running && !timer.finished) return null;

  const progress =
    timer.totalSeconds > 0 ? Math.max(0, Math.min(1, timer.remaining / timer.totalSeconds)) : 0;

  return (
    <div className="fixed inset-x-0 bottom-[60px] z-40 mx-auto max-w-lg px-3 pb-2">
      <div
        className={`overflow-hidden rounded-2xl shadow-lg ring-1 ${
          timer.finished ? 'bg-good/20 ring-good/50' : 'bg-ink-700 ring-ink-500'
        }`}
      >
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">{da.log.restTimer}</span>
          <span
            className={`flex-1 text-center text-2xl font-bold tabular-nums ${
              timer.finished ? 'text-good' : ''
            }`}
          >
            {timer.finished ? da.log.restDone : formatClock(timer.remaining)}
          </span>
          <button
            type="button"
            className="btn h-9 min-h-[36px] bg-ink-600 px-2 text-xs"
            onClick={() => timer.extend(30)}
            disabled={!timer.running}
          >
            {da.log.addRest}
          </button>
          <button
            type="button"
            className="btn h-9 min-h-[36px] bg-ink-600 px-2 text-xs"
            onClick={timer.stop}
          >
            ✕
          </button>
        </div>
        {timer.running ? (
          <div className="h-1 bg-ink-600">
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FinishSheet({
  session,
  sessionSets,
  onClose,
  onFinished,
}: {
  session: Session;
  sessionSets: SetLog[];
  onClose: () => void;
  onFinished: () => void;
}) {
  const [durationMin, setDurationMin] = useState(
    Math.max(1, Math.round((Date.now() - session.startedAt) / 60000)),
  );
  const [bodyWeight, setBodyWeight] = useState<number>(session.bodyWeightKg ?? 0);
  const [sleep, setSleep] = useState<number | null>(session.sleep);
  const [energy, setEnergy] = useState<number | null>(session.energy);
  const [notes, setNotes] = useState(session.notes);

  const save = async () => {
    await db.sessions.update(session.id, {
      status: 'done',
      endedAt: Date.now(),
      durationMin,
      bodyWeightKg: bodyWeight > 0 ? bodyWeight : null,
      sleep: (sleep as Session['sleep']) ?? null,
      energy: (energy as Session['energy']) ?? null,
      notes,
    });
    onFinished();
  };

  const discard = async () => {
    if (!confirm(da.log.discardConfirm)) return;
    await db.transaction('rw', db.sessions, db.setLogs, async () => {
      await db.setLogs.where('sessionId').equals(session.id).delete();
      await db.sessions.delete(session.id);
    });
    onFinished();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={da.log.finishTitle}
      footer={
        <button type="button" className="btn-primary w-full" onClick={save}>
          {da.log.finishConfirm}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="card flex justify-between text-sm">
          <span className="text-slate-400">
            {sessionSets.filter((set) => !set.warmup).length} {da.common.sets}
          </span>
          <span className="tabular-nums">{formatTonnage(tonnage(sessionSets))}</span>
        </div>

        <Stepper
          label={da.log.duration}
          value={durationMin}
          onChange={setDurationMin}
          step={5}
          min={1}
          max={480}
        />
        <Stepper
          label={da.log.bodyWeight}
          value={bodyWeight}
          onChange={setBodyWeight}
          step={0.1}
          bigStep={1}
          format={formatKg}
          suffix={da.common.kg}
        />
        <RatingPicker label={da.log.sleep} value={sleep} onChange={setSleep} />
        <RatingPicker label={da.log.energy} value={energy} onChange={setEnergy} />

        <label className="block">
          <span className="label">{da.log.sessionNotes}</span>
          <textarea
            className="field min-h-[96px] py-2"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>

        <button type="button" className="btn-danger w-full" onClick={discard}>
          {da.log.discard}
        </button>
      </div>
    </Sheet>
  );
}
