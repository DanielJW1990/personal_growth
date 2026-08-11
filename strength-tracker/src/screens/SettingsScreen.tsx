import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { seedTemplates } from '../db/seed';
import type { Settings } from '../db/types';
import { da, t } from '../i18n/da';
import { SectionTitle, Sheet, Stepper, Toggle } from '../components/ui';
import {
  backupFilename,
  buildBackup,
  downloadFile,
  importBackup,
  parseBackup,
  setLogsToCsv,
  type ImportCounts,
} from '../lib/backup';
import { formatKg } from '../lib/format';

export function SettingsScreen() {
  const settings = useLiveQuery(() => db.settings.get('settings'), [], undefined);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!settings) return null;

  const update = async (patch: Partial<Settings>) => {
    await db.settings.put({ ...settings, ...patch });
  };

  const exportJson = async () => {
    const backup = await buildBackup();
    downloadFile(
      JSON.stringify(backup, null, 2),
      backupFilename('styrketraening', 'json'),
      'application/json',
    );
  };

  const exportCsv = async () => {
    const [setLogs, sessions, exercises] = await Promise.all([
      db.setLogs.toArray(),
      db.sessions.toArray(),
      db.exercises.toArray(),
    ]);
    downloadFile(
      setLogsToCsv(setLogs, sessions, exercises),
      backupFilename('saetlog', 'csv'),
      'text/csv',
    );
  };

  const runImport = async (mode: 'replace' | 'merge') => {
    if (!pendingImport) return;
    const backup = parseBackup(pendingImport);
    setPendingImport(null);
    if (!backup) {
      setMessage({ kind: 'error', text: da.settings.importFailed });
      return;
    }
    const counts = await importBackup(backup, mode);
    setMessage({ kind: 'ok', text: t(da.settings.importDone, { counts: describe(counts) }) });
  };

  const restoreTemplates = async () => {
    const existing = new Set(await db.templates.toCollection().primaryKeys());
    const missing = seedTemplates(Date.now()).filter((template) => !existing.has(template.id));
    if (missing.length > 0) await db.templates.bulkPut(missing);
    setMessage({ kind: 'ok', text: da.common.saved });
  };

  const wipe = async () => {
    if (!confirm(da.settings.wipeConfirm)) return;
    await db.transaction(
      'rw',
      [db.exercises, db.templates, db.sessions, db.setLogs, db.bodyScans, db.settings],
      async () => {
        await Promise.all([
          db.exercises.clear(),
          db.templates.clear(),
          db.sessions.clear(),
          db.setLogs.clear(),
          db.bodyScans.clear(),
          db.settings.clear(),
        ]);
      },
    );
    window.location.reload();
  };

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-4 text-2xl font-bold">{da.settings.title}</h1>

      <SectionTitle>{da.settings.gym}</SectionTitle>
      <div className="space-y-3">
        <Stepper
          label={da.settings.barWeight}
          value={settings.barWeightKg}
          onChange={(value) => update({ barWeightKg: value })}
          step={2.5}
          min={0}
          max={40}
          format={formatKg}
          suffix={da.common.kg}
        />
        <label className="block">
          <span className="label">{da.settings.plates}</span>
          <input
            className="field"
            inputMode="decimal"
            value={settings.availablePlatesKg.join(', ')}
            onChange={(event) =>
              update({
                availablePlatesKg: event.target.value
                  .split(',')
                  .map((part) => Number(part.trim().replace(',', '.')))
                  .filter((value) => Number.isFinite(value) && value > 0),
              })
            }
          />
        </label>
      </div>

      <SectionTitle>{da.settings.rest}</SectionTitle>
      <div className="space-y-3">
        <Stepper
          label={da.settings.restCompound}
          value={settings.restSecondsCompound}
          onChange={(value) => update({ restSecondsCompound: value })}
          step={15}
          min={15}
          max={600}
        />
        <Stepper
          label={da.settings.restSuperset}
          value={settings.restSecondsSuperset}
          onChange={(value) => update({ restSecondsSuperset: value })}
          step={15}
          min={15}
          max={600}
        />
        <Toggle
          label={da.settings.sound}
          checked={settings.soundEnabled}
          onChange={(soundEnabled) => update({ soundEnabled })}
        />
        <Toggle
          label={da.settings.vibration}
          checked={settings.vibrationEnabled}
          onChange={(vibrationEnabled) => update({ vibrationEnabled })}
        />
      </div>

      <SectionTitle>{da.settings.program}</SectionTitle>
      <div className="space-y-3">
        <label className="block">
          <span className="label">{da.settings.programStart}</span>
          <input
            className="field"
            type="date"
            value={settings.programStartDate}
            onChange={(event) => update({ programStartDate: event.target.value })}
          />
        </label>
        <Stepper
          label={da.settings.weeklySetTarget}
          value={settings.weeklySetTarget}
          onChange={(value) => update({ weeklySetTarget: value })}
          step={1}
          min={1}
          max={30}
        />
        <button type="button" className="btn-ghost w-full" onClick={restoreTemplates}>
          {da.settings.reseed}
        </button>
        <p className="text-xs text-slate-500">{da.settings.reseedHint}</p>
      </div>

      <SectionTitle>{da.settings.data}</SectionTitle>
      <div className="space-y-3">
        <button type="button" className="btn-secondary w-full" onClick={exportJson}>
          {da.settings.exportJson}
        </button>
        <button type="button" className="btn-secondary w-full" onClick={exportCsv}>
          {da.settings.exportCsv}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setPendingImport(await file.text());
          }}
        />
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => fileInput.current?.click()}
        >
          {da.settings.importJson}
        </button>

        {message ? (
          <p
            className={`rounded-xl p-3 text-sm ${
              message.kind === 'ok' ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'
            }`}
          >
            {message.text}
          </p>
        ) : null}

        <p className="rounded-xl bg-ink-800 p-3 text-xs leading-relaxed text-slate-400">
          {da.settings.privacy}
        </p>
      </div>

      <SectionTitle>{da.settings.dangerZone}</SectionTitle>
      <button type="button" className="btn-danger w-full" onClick={wipe}>
        {da.settings.wipe}
      </button>

      {pendingImport !== null ? (
        <Sheet open onClose={() => setPendingImport(null)} title={da.settings.importTitle}>
          <p className="mb-4 text-sm text-slate-300">{da.settings.importChooseMode}</p>
          <div className="space-y-3">
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => runImport('merge')}
            >
              {da.settings.importMerge}
            </button>
            <button type="button" className="btn-danger w-full" onClick={() => runImport('replace')}>
              {da.settings.importReplace}
            </button>
            <p className="text-xs text-warn">{da.settings.importReplaceWarning}</p>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function describe(counts: ImportCounts): string {
  return [
    `${counts.exercises} ${da.settings.countExercises}`,
    `${counts.templates} ${da.settings.countTemplates}`,
    `${counts.sessions} ${da.settings.countSessions}`,
    `${counts.setLogs} ${da.settings.countSets}`,
    `${counts.bodyScans} ${da.settings.countScans}`,
  ].join(', ');
}
