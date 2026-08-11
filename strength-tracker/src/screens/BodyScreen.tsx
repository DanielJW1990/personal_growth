import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import type { BodyScan } from '../db/types';
import { da } from '../i18n/da';
import { EmptyState, SectionTitle, Sheet } from '../components/ui';
import { formatLongDate, todayIso } from '../lib/date';
import { formatNumber, parseDecimal } from '../lib/format';
import { fileToScaledDataUrl } from '../lib/image';

/** Numeric fields of a scan, in the order they are entered. */
type ScanNumberField = Extract<
  keyof BodyScan,
  | 'weightKg'
  | 'bodyFatPct'
  | 'fatMassKg'
  | 'muscleMassKg'
  | 'leanBodyMassKg'
  | 'bodyWaterPct'
  | 'visceralFat'
  | 'boneMassKg'
  | 'bmr'
  | 'metabolicAge'
  | 'smi'
  | 'waistCm'
  | 'chestCm'
  | 'armCm'
  | 'thighCm'
>;

const SCALE_FIELDS: ScanNumberField[] = [
  'weightKg',
  'bodyFatPct',
  'fatMassKg',
  'muscleMassKg',
  'leanBodyMassKg',
  'bodyWaterPct',
  'visceralFat',
  'boneMassKg',
  'bmr',
  'metabolicAge',
  'smi',
];

const TAPE_FIELDS: ScanNumberField[] = ['waistCm', 'chestCm', 'armCm', 'thighCm'];

function emptyScan(): BodyScan {
  return {
    id: newId('scan_'),
    date: todayIso(),
    weightKg: null,
    bodyFatPct: null,
    fatMassKg: null,
    muscleMassKg: null,
    leanBodyMassKg: null,
    bodyWaterPct: null,
    visceralFat: null,
    boneMassKg: null,
    bmr: null,
    metabolicAge: null,
    smi: null,
    waistCm: null,
    chestCm: null,
    armCm: null,
    thighCm: null,
    photos: [],
    notes: '',
    createdAt: Date.now(),
  };
}

export function BodyScreen() {
  const scans = useLiveQuery(() => db.bodyScans.orderBy('date').reverse().toArray(), [], undefined);
  const [editing, setEditing] = useState<BodyScan | null>(null);

  if (!scans) return null;

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-4 text-2xl font-bold">{da.body.title}</h1>

      <button
        type="button"
        className="btn-primary w-full text-lg"
        onClick={() => setEditing(emptyScan())}
      >
        {da.body.newScan}
      </button>

      <SectionTitle>{da.body.measurements}</SectionTitle>
      {scans.length === 0 ? <EmptyState>{da.body.noScans}</EmptyState> : null}

      <div className="space-y-2">
        {scans.map((scan) => (
          <button
            key={scan.id}
            type="button"
            className="card w-full text-left"
            onClick={() => setEditing(scan)}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{formatLongDate(scan.date)}</span>
              {scan.weightKg !== null ? (
                <span className="text-lg font-bold tabular-nums">
                  {formatNumber(scan.weightKg, 1)} kg
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
              {[...SCALE_FIELDS, ...TAPE_FIELDS]
                .filter((field) => field !== 'weightKg' && scan[field] !== null)
                .map((field) => (
                  <span key={field} className="tabular-nums">
                    {da.body.fields[field].replace(/\s*\(.*\)$/, '')}:{' '}
                    {formatNumber(scan[field] as number, 1)}
                  </span>
                ))}
            </div>
            {scan.photos.length > 0 ? (
              <div className="mt-2 flex gap-2">
                {scan.photos.slice(0, 4).map((photo, index) => (
                  <img
                    key={index}
                    src={photo}
                    alt=""
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                ))}
              </div>
            ) : null}
          </button>
        ))}
      </div>

      {editing ? (
        <ScanEditor
          scan={editing}
          isNew={!scans.some((item) => item.id === editing.id)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function ScanEditor({
  scan,
  isNew,
  onClose,
}: {
  scan: BodyScan;
  isNew: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BodyScan>(scan);
  const fileInput = useRef<HTMLInputElement>(null);

  const setField = (field: ScanNumberField, raw: string) => {
    setDraft((current) => ({ ...current, [field]: parseDecimal(raw) }));
  };

  const addPhoto = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const encoded = await Promise.all([...files].map(fileToScaledDataUrl));
    setDraft((current) => ({ ...current, photos: [...current.photos, ...encoded] }));
  };

  const save = async () => {
    await db.bodyScans.put(draft);
    onClose();
  };

  const remove = async () => {
    if (!confirm(da.common.confirmDelete)) return;
    await db.bodyScans.delete(draft.id);
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? da.body.newScan : da.body.editScan}
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
          <span className="label">{da.common.date}</span>
          <input
            className="field"
            type="date"
            value={draft.date}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
          />
        </label>

        <p className="text-sm text-slate-400">{da.body.allOptional}</p>

        <SectionTitle>{da.body.scale}</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {SCALE_FIELDS.map((field) => (
            <NumberField
              key={field}
              label={da.body.fields[field]}
              value={draft[field] as number | null}
              onChange={(raw) => setField(field, raw)}
            />
          ))}
        </div>

        <SectionTitle>{da.body.tape}</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {TAPE_FIELDS.map((field) => (
            <NumberField
              key={field}
              label={da.body.fields[field]}
              value={draft[field] as number | null}
              onChange={(raw) => setField(field, raw)}
            />
          ))}
        </div>

        <SectionTitle>{da.body.photos}</SectionTitle>
        <p className="text-xs text-slate-500">{da.body.photoHint}</p>
        <div className="flex flex-wrap gap-2">
          {draft.photos.map((photo, index) => (
            <div key={index} className="relative">
              <img src={photo} alt="" className="h-24 w-24 rounded-xl object-cover" />
              <button
                type="button"
                aria-label={da.body.removePhoto}
                className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-bad text-ink-900"
                onClick={() =>
                  setDraft({
                    ...draft,
                    photos: draft.photos.filter((_photo, i) => i !== index),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void addPhoto(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => fileInput.current?.click()}
        >
          {da.body.addPhoto}
        </button>

        <label className="block">
          <span className="label">{da.common.notes}</span>
          <textarea
            className="field min-h-[80px] py-2"
            value={draft.notes}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </label>
      </div>
    </Sheet>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (raw: string) => void;
}) {
  return (
    <label className="block">
      <span className="label text-xs">{label}</span>
      <input
        className="field"
        type="text"
        inputMode="decimal"
        placeholder="–"
        value={value === null ? '' : String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
