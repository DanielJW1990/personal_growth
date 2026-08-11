import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, Cell, LabelList, Line, LineChart, ReferenceLine } from 'recharts';
import { db } from '../db/db';
import { MUSCLE_GROUPS, type BodyScan } from '../db/types';
import { da, muscleGroupLabels, t } from '../i18n/da';
import { Segmented } from '../components/ui';
import {
  AXIS_PROPS,
  CHART,
  ChartFrame,
  ChartGrid,
  ChartLegend,
  DarkTooltip,
  XAxis,
  YAxis,
} from '../components/charts';
import { formatShortDate, todayIso } from '../lib/date';
import { formatKg, formatNumber, formatTonnage } from '../lib/format';
import {
  computeWeekStreak,
  e1rmSeries,
  linearTrend,
  movingAverage,
  sessionsInMonth,
  setsPerMuscleGroup,
  tonnagePerSession,
  tonnagePerWeek,
  weeksOnProgram,
  programStart,
} from '../lib/stats';

export function StatsScreen() {
  const settings = useLiveQuery(() => db.settings.get('settings'), [], undefined);
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], undefined);
  const sets = useLiveQuery(() => db.setLogs.toArray(), [], undefined);
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);
  const scans = useLiveQuery(() => db.bodyScans.orderBy('date').toArray(), [], undefined);

  if (!settings || !sessions || !sets || !exercises || !scans) return null;

  const done = sessions.filter((session) => session.status === 'done');
  const today = todayIso();
  const blockStart = programStart(settings.programStartDate, done.map((session) => session.date));

  return (
    <div className="space-y-4 px-4 pb-24 pt-4">
      <h1 className="text-2xl font-bold">{da.stats.title}</h1>

      <section className="grid grid-cols-3 gap-2">
        <Tile
          value={String(computeWeekStreak(done.map((session) => session.date), today))}
          label={da.home.streakUnit}
        />
        <Tile
          value={String(sessionsInMonth(done.map((session) => session.date), today))}
          label={da.home.sessionsThisMonth}
        />
        <Tile
          value={String(weeksOnProgram(blockStart, today))}
          label={da.home.weeksOnProgram}
        />
      </section>

      <OneRepMaxChart sets={sets} sessions={done} exercises={exercises} />
      <TonnageChart sets={sets} sessions={done} />
      <MuscleVolumeChart
        sets={sets}
        sessions={done}
        exercises={exercises}
        target={settings.weeklySetTarget}
        today={today}
      />
      <BodyWeightChart scans={scans} sessions={done} />
      <CompositionChart scans={scans} />
    </div>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="card px-3 py-3 text-center">
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] leading-tight text-slate-400">{label}</div>
    </div>
  );
}

type Sets = Parameters<typeof e1rmSeries>[0];
type Sessions = Parameters<typeof tonnagePerSession>[1];
type Exercises = Parameters<typeof setsPerMuscleGroup>[2];
type BodyScans = BodyScan[];

function OneRepMaxChart({
  sets,
  sessions,
  exercises,
}: {
  sets: Sets;
  sessions: Sessions;
  exercises: Exercises;
}) {
  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );

  // Only offer exercises that actually have working sets behind them.
  const options = useMemo(() => {
    const withData = new Set(
      sets.filter((set) => !set.warmup && sessionsById.has(set.sessionId)).map((s) => s.exerciseId),
    );
    return exercises
      .filter((exercise) => withData.has(exercise.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'da'));
  }, [sets, exercises, sessionsById]);

  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const selected = options.find((item) => item.id === (exerciseId ?? options[0]?.id)) ?? null;

  const series = useMemo(
    () => (selected ? e1rmSeries(sets, sessionsById, selected.id) : []),
    [sets, sessionsById, selected],
  );
  const trend = useMemo(() => linearTrend(series), [series]);

  const data = series.map((point) => ({
    date: point.date,
    value: point.value,
    trend: trend ? Math.round(trend.predict(point.date) * 10) / 10 : undefined,
  }));

  if (options.length === 0) {
    return (
      <ChartFrame
        title={da.stats.e1rmTitle}
        subtitle={da.stats.e1rmSubtitle}
        empty={da.stats.noExerciseData}
      />
    );
  }

  const slope = trend?.slopePerWeek ?? 0;

  return (
    <div>
      <ChartFrame
        title={da.stats.e1rmTitle}
        subtitle={da.stats.e1rmSubtitle}
        action={
          trend ? (
            <span
              className={`chip ${slope >= 0 ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'} tabular-nums`}
            >
              {t(da.stats.trendPerWeek, {
                sign: slope >= 0 ? '+' : '−',
                value: formatNumber(Math.abs(slope), 1),
              })}
            </span>
          ) : undefined
        }
      >
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <ChartGrid />
          <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={formatShortDate} minTickGap={24} />
          <YAxis
            {...AXIS_PROPS}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={(value: number) => formatNumber(value, 1)}
          />
          <DarkTooltip
            labelFormatter={formatShortDate}
            valueFormatter={(value) => `${formatKg(value)} kg`}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={da.stats.e1rmTitle}
            stroke={CHART.series1}
            strokeWidth={2}
            dot={{ r: 4, fill: CHART.series1, stroke: CHART.surface, strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
          {trend ? (
            <Line
              type="linear"
              dataKey="trend"
              name={da.stats.trend}
              stroke={CHART.muted}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
            />
          ) : null}
        </LineChart>
      </ChartFrame>

      <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
        {options.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            onClick={() => setExerciseId(exercise.id)}
            className={`btn h-10 min-h-[40px] shrink-0 px-3 text-sm ${
              selected?.id === exercise.id ? 'bg-accent text-ink-900' : 'bg-ink-700 text-slate-300'
            }`}
          >
            {exercise.name}
          </button>
        ))}
      </div>
      <ChartLegend
        items={[
          { color: CHART.series1, label: da.stats.e1rmTitle },
          { color: CHART.muted, label: da.stats.trend },
        ]}
      />
    </div>
  );
}

function TonnageChart({ sets, sessions }: { sets: Sets; sessions: Sessions }) {
  const [mode, setMode] = useState<'session' | 'week'>('session');
  const perSession = useMemo(() => tonnagePerSession(sets, sessions), [sets, sessions]);
  const perWeek = useMemo(() => tonnagePerWeek(perSession), [perSession]);

  if (perSession.length === 0) {
    return (
      <ChartFrame title={da.stats.tonnageTitle} empty={da.common.noData} />
    );
  }

  const data =
    mode === 'session'
      ? perSession.slice(-14).map((item) => ({ label: item.date, value: item.value }))
      : perWeek.slice(-12).map((item) => ({ label: item.week, value: item.value }));

  const formatLabel = (label: string) =>
    mode === 'session' ? formatShortDate(label) : label.replace(/^\d{4}-/, '');

  return (
    <div>
      <ChartFrame title={da.stats.tonnageTitle}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -4 }} barCategoryGap={4}>
          <ChartGrid />
          <XAxis dataKey="label" {...AXIS_PROPS} tickFormatter={formatLabel} minTickGap={16} />
          <YAxis
            {...AXIS_PROPS}
            width={52}
            tickFormatter={(value: number) => formatNumber(value / 1000, 0) + 't'}
          />
          <DarkTooltip labelFormatter={formatLabel} valueFormatter={(v) => formatTonnage(v)} />
          <Bar
            dataKey="value"
            name={da.stats.tonnageTitle}
            fill={CHART.series1}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartFrame>
      <div className="mt-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'session', label: da.stats.tonnagePerSession },
            { value: 'week', label: da.stats.tonnagePerWeek },
          ]}
        />
      </div>
    </div>
  );
}

function MuscleVolumeChart({
  sets,
  sessions,
  exercises,
  target,
  today,
}: {
  sets: Sets;
  sessions: Sessions;
  exercises: Exercises;
  target: number;
  today: string;
}) {
  const counts = useMemo(
    () => setsPerMuscleGroup(sets, sessions, exercises, today),
    [sets, sessions, exercises, today],
  );

  const data = MUSCLE_GROUPS.map((muscle) => ({
    muscle,
    label: muscleGroupLabels[muscle],
    value: counts[muscle] ?? 0,
  }));
  const below = data.filter((item) => item.value < target);
  const hasAnySets = data.some((item) => item.value > 0);

  return (
    <div>
      <ChartFrame
        title={da.stats.setsPerMuscle}
        subtitle={da.stats.setsPerMuscleSubtitle}
        height={280}
      >
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
          barCategoryGap={4}
        >
          <ChartGrid />
          <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
          <YAxis type="category" dataKey="label" {...AXIS_PROPS} width={72} />
          <DarkTooltip valueFormatter={(value) => `${value} ${da.common.sets}`} />
          <Bar dataKey="value" name={da.common.sets} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((item) => (
              <Cell key={item.muscle} fill={item.value >= target ? CHART.good : CHART.warning} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              fill={CHART.axis}
              fontSize={11}
              formatter={(value: number) => (value > 0 ? String(value) : '')}
            />
          </Bar>
        </BarChart>
      </ChartFrame>

      {hasAnySets ? (
        <p
          className={`mt-2 rounded-xl p-3 text-sm ${
            below.length > 0 ? 'bg-warn/10 text-warn ring-1 ring-warn/30' : 'bg-good/10 text-good'
          }`}
        >
          {below.length > 0 ? (
            <>
              ⚠{' '}
              {t(da.stats.lowVolumeWarning, {
                target,
                groups: below.map((item) => `${item.label} (${item.value})`).join(', '),
              })}
            </>
          ) : (
            <>✓ {t(da.stats.volumeOk, { target })}</>
          )}
        </p>
      ) : null}
    </div>
  );
}

function BodyWeightChart({ scans, sessions }: { scans: BodyScans; sessions: Sessions }) {
  // Body weight is typed in on the body screen and again when finishing a
  // session; both are the same measurement, so both feed the chart.
  const points = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const session of sessions) {
      if (session.bodyWeightKg) byDate.set(session.date, session.bodyWeightKg);
    }
    for (const scan of scans) {
      if (scan.weightKg !== null) byDate.set(scan.date, scan.weightKg);
    }
    return [...byDate.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [scans, sessions]);

  const smoothed = useMemo(() => movingAverage(points, 7), [points]);
  const data = points.map((point, index) => ({
    date: point.date,
    raw: point.value,
    average: smoothed[index]?.value,
  }));

  if (data.length === 0) {
    return (
      <ChartFrame
        title={da.stats.bodyWeightTitle}
        subtitle={da.stats.bodyWeightSubtitle}
        empty={da.common.noData}
      />
    );
  }

  return (
    <div>
      <ChartFrame title={da.stats.bodyWeightTitle} subtitle={da.stats.bodyWeightSubtitle}>
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <ChartGrid />
          <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={formatShortDate} minTickGap={24} />
          <YAxis
            {...AXIS_PROPS}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={(value: number) => formatNumber(value, 1)}
          />
          <DarkTooltip
            labelFormatter={formatShortDate}
            valueFormatter={(value) => `${formatNumber(value, 1)} kg`}
          />
          {/* The daily reading stays thin and grey so it cannot dominate. */}
          <Line
            type="monotone"
            dataKey="raw"
            name={da.stats.rawWeight}
            stroke={CHART.muted}
            strokeWidth={1}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="average"
            name={da.stats.movingAverage}
            stroke={CHART.series1}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ChartFrame>
      <ChartLegend
        items={[
          { color: CHART.series1, label: da.stats.movingAverage },
          { color: CHART.muted, label: da.stats.rawWeight },
        ]}
      />
    </div>
  );
}

function CompositionChart({ scans }: { scans: BodyScans }) {
  const [mode, setMode] = useState<'absolute' | 'change'>('change');

  const points = useMemo(
    () =>
      scans
        .filter((scan) => scan.fatMassKg !== null || scan.leanBodyMassKg !== null)
        .map((scan) => ({
          date: scan.date,
          fat: scan.fatMassKg,
          lean: scan.leanBodyMassKg,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [scans],
  );

  // Lean mass sits four times higher than fat mass, so on a shared axis the
  // absolute view flattens both trends. Showing the change since the first
  // measurement puts them on a common base — which is the actual question.
  const baseline = useMemo(() => {
    const firstFat = points.find((point) => point.fat !== null)?.fat ?? null;
    const firstLean = points.find((point) => point.lean !== null)?.lean ?? null;
    return { fat: firstFat, lean: firstLean };
  }, [points]);

  const data = points.map((point) => ({
    date: point.date,
    fat:
      mode === 'absolute'
        ? point.fat
        : point.fat !== null && baseline.fat !== null
          ? Math.round((point.fat - baseline.fat) * 10) / 10
          : null,
    lean:
      mode === 'absolute'
        ? point.lean
        : point.lean !== null && baseline.lean !== null
          ? Math.round((point.lean - baseline.lean) * 10) / 10
          : null,
  }));

  if (points.length === 0) {
    return (
      <ChartFrame
        title={da.stats.compositionTitle}
        subtitle={da.stats.compositionSubtitle}
        empty={da.common.noData}
      />
    );
  }

  // Dots on 40 measurements turn the line into a dotted band.
  const showDots = data.length <= 15;

  return (
    <div>
      <ChartFrame
        title={da.stats.compositionTitle}
        subtitle={
          mode === 'change'
            ? t(da.stats.compositionChangeHint, { date: formatShortDate(points[0].date) })
            : da.stats.compositionSubtitle
        }
      >
        {/* Both series are kilos, so they share one axis — never two scales. */}
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <ChartGrid />
          {mode === 'change' ? <ReferenceLine y={0} stroke={CHART.axis} strokeWidth={1} /> : null}
          <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={formatShortDate} minTickGap={24} />
          <YAxis
            {...AXIS_PROPS}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={(value: number) => formatNumber(value, 1)}
          />
          <DarkTooltip
            labelFormatter={formatShortDate}
            valueFormatter={(value) =>
              `${mode === 'change' && value > 0 ? '+' : ''}${formatNumber(value, 1)} kg`
            }
          />
          <Line
            type="monotone"
            dataKey="lean"
            name={da.stats.leanBodyMass}
            stroke={CHART.series1}
            strokeWidth={2}
            connectNulls
            dot={showDots ? { r: 4, fill: CHART.series1, stroke: CHART.surface, strokeWidth: 2 } : false}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="fat"
            name={da.stats.fatMass}
            stroke={CHART.series2}
            strokeWidth={2}
            connectNulls
            dot={showDots ? { r: 4, fill: CHART.series2, stroke: CHART.surface, strokeWidth: 2 } : false}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ChartFrame>
      <ChartLegend
        items={[
          { color: CHART.series1, label: da.stats.leanBodyMass },
          { color: CHART.series2, label: da.stats.fatMass },
        ]}
      />
      <div className="mt-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'change', label: da.stats.compositionChange },
            { value: 'absolute', label: da.stats.compositionAbsolute },
          ]}
        />
      </div>
    </div>
  );
}
