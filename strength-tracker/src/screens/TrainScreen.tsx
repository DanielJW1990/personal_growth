import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import type { Session, WorkoutTemplate } from '../db/types';
import { da, t } from '../i18n/da';
import { EmptyState, SectionTitle } from '../components/ui';
import { LogScreen } from './LogScreen';
import { formatSetScheme } from './ProgramScreen';
import { formatLongDate, formatShortDate, todayIso } from '../lib/date';
import { computeWeekStreak, programStart, sessionsInMonth, weeksOnProgram } from '../lib/stats';
import { tonnage } from '../lib/history';
import { formatTonnage } from '../lib/format';

export function TrainScreen() {
  const settings = useLiveQuery(() => db.settings.get('settings'), [], undefined);
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], undefined);
  const templates = useLiveQuery(() => db.templates.orderBy('position').toArray(), [], undefined);
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const active = sessions?.find((session) => session.status === 'active') ?? null;

  if (!settings || !sessions || !templates || !exercises) return null;

  // An active session takes over the whole tab: that is where the work happens.
  if (active && (openSessionId === active.id || openSessionId === null)) {
    return (
      <LogScreen
        session={active}
        settings={settings}
        onFinished={() => setOpenSessionId(null)}
      />
    );
  }

  const startSession = async (template: WorkoutTemplate) => {
    const session: Session = {
      id: newId('ses_'),
      date: todayIso(),
      startedAt: Date.now(),
      endedAt: null,
      templateId: template.id,
      templateName: template.name,
      plan: template.exercises.map((entry) => ({ ...entry, repRange: { ...entry.repRange } })),
      durationMin: null,
      bodyWeightKg: null,
      sleep: null,
      energy: null,
      notes: '',
      status: 'active',
    };
    await db.sessions.add(session);
    setOpenSessionId(session.id);
  };

  const done = sessions.filter((session) => session.status === 'done');
  const doneDates = done.map((session) => session.date);
  const today = todayIso();
  const streak = computeWeekStreak(doneDates, today);
  const monthCount = sessionsInMonth(doneDates, today);
  const programWeek = weeksOnProgram(programStart(settings.programStartDate, doneDates), today);

  const lastByTemplate = new Map<string, string>();
  for (const session of [...done].sort((a, b) => a.startedAt - b.startedAt)) {
    if (session.templateId) lastByTemplate.set(session.templateId, session.date);
  }

  // Suggest whichever template has gone longest without being trained.
  const suggestedId =
    templates.length > 0
      ? [...templates].sort((a, b) => {
          const aDate = lastByTemplate.get(a.id) ?? '';
          const bDate = lastByTemplate.get(b.id) ?? '';
          return aDate.localeCompare(bDate) || a.position - b.position;
        })[0].id
      : null;

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-4 text-2xl font-bold">{da.app.title}</h1>

      <div className="grid grid-cols-3 gap-2">
        <StatTile value={String(streak)} label={da.home.streakUnit} />
        <StatTile value={String(monthCount)} label={da.home.sessionsThisMonth} />
        <StatTile value={String(programWeek)} label={da.home.weeksOnProgram} />
      </div>

      {programWeek >= 8 && programWeek <= 12 ? (
        <p className="mt-3 rounded-2xl bg-warn/10 p-3 text-sm text-warn ring-1 ring-warn/30">
          {t(da.home.variationHint, { week: programWeek })}
        </p>
      ) : null}

      {active ? (
        <button
          type="button"
          className="btn-primary mt-4 w-full text-lg"
          onClick={() => setOpenSessionId(active.id)}
        >
          {da.home.resumeWorkout}
        </button>
      ) : null}

      <SectionTitle>{da.home.pickTemplate}</SectionTitle>
      {templates.length === 0 ? <EmptyState>{da.common.noData}</EmptyState> : null}
      <div className="space-y-3">
        {templates.map((template) => {
          const last = lastByTemplate.get(template.id);
          return (
            <div
              key={template.id}
              className={`card ${template.id === suggestedId ? 'ring-2 ring-accent/60' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold">
                    {template.name}
                    {template.id === suggestedId ? (
                      <span className="ml-2 chip bg-accent/15 text-accent">
                        {da.home.suggestedNext}
                      </span>
                    ) : null}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {da.home.lastTrained}:{' '}
                    {last ? formatShortDate(last) : da.home.never}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary shrink-0 px-4"
                  onClick={() => startSession(template)}
                  disabled={active !== null}
                >
                  {da.home.startWorkout}
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-slate-300">
                {template.exercises.map((entry, index) => (
                  <li key={`${entry.exerciseId}-${index}`} className="flex justify-between gap-3">
                    <span className="truncate">
                      {entry.supersetGroup ? (
                        <span className="mr-1 rounded bg-ink-600 px-1 text-xs text-accent">
                          {entry.supersetGroup}
                        </span>
                      ) : null}
                      {exercises.find((item) => item.id === entry.exerciseId)?.name ??
                        entry.exerciseId}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-400">
                      {formatSetScheme(entry)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <RecentSessions sessions={done} />
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="card px-3 py-3 text-center">
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] leading-tight text-slate-400">{label}</div>
    </div>
  );
}

function RecentSessions({ sessions }: { sessions: Session[] }) {
  const recent = useMemo(
    () => [...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 8),
    [sessions],
  );
  const ids = recent.map((session) => session.id);
  const sets = useLiveQuery(
    () => db.setLogs.where('sessionId').anyOf(ids).toArray(),
    [ids.join(',')],
    undefined,
  );
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);
  const nameOf = (exerciseId: string) =>
    (exercises ?? []).find((exercise) => exercise.id === exerciseId)?.name ?? exerciseId;
  const [openId, setOpenId] = useState<string | null>(null);

  if (recent.length === 0) {
    return (
      <>
        <SectionTitle>{da.home.recentSessions}</SectionTitle>
        <EmptyState>{da.home.noSessions}</EmptyState>
      </>
    );
  }

  return (
    <>
      <SectionTitle>{da.home.recentSessions}</SectionTitle>
      <div className="space-y-2">
        {recent.map((session) => {
          const sessionSets = (sets ?? []).filter((set) => set.sessionId === session.id);
          const working = sessionSets.filter((set) => !set.warmup);
          return (
            <div key={session.id} className="card py-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setOpenId(openId === session.id ? null : session.id)}
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">{session.templateName}</div>
                  <div className="text-xs text-slate-400">{formatLongDate(session.date)}</div>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-400">
                  <div className="tabular-nums">
                    {working.length} {da.common.sets}
                  </div>
                  <div className="tabular-nums">{formatTonnage(tonnage(sessionSets))}</div>
                </div>
              </button>

              {openId === session.id ? (
                <ul className="mt-3 space-y-1 border-t border-ink-600 pt-3 text-sm text-slate-300">
                  {session.durationMin ? (
                    <li className="text-xs text-slate-400">
                      {da.log.duration}: {session.durationMin} min
                      {session.bodyWeightKg ? ` · ${session.bodyWeightKg} kg` : ''}
                      {session.sleep ? ` · ${da.log.sleep} ${session.sleep}/5` : ''}
                      {session.energy ? ` · ${da.log.energy} ${session.energy}/5` : ''}
                    </li>
                  ) : null}
                  {working.map((set) => (
                    <li key={set.id} className="flex justify-between tabular-nums">
                      <span className="truncate">{nameOf(set.exerciseId)}</span>
                      <span className="text-slate-400">
                        {set.weightKg} kg × {set.reps}
                      </span>
                    </li>
                  ))}
                  {session.notes ? (
                    <li className="pt-1 text-xs italic text-slate-400">{session.notes}</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
