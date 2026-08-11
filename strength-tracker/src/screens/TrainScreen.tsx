import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { da } from '../i18n/da';
import { EmptyState } from '../components/ui';
import { formatSetScheme } from './ProgramScreen';

export function TrainScreen() {
  const templates = useLiveQuery(() => db.templates.orderBy('position').toArray(), [], undefined);
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);
  if (!templates || !exercises) return null;
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? id;

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-4 text-2xl font-bold">{da.home.pickTemplate}</h1>
      {templates.length === 0 ? <EmptyState>{da.common.noData}</EmptyState> : null}
      <div className="space-y-3">
        {templates.map((template) => (
          <div key={template.id} className="card">
            <h2 className="text-lg font-bold">{template.name}</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-300">
              {template.exercises.map((entry, index) => (
                <li key={index} className="flex justify-between">
                  <span>{nameOf(entry.exerciseId)}</span>
                  <span className="tabular-nums text-slate-400">{formatSetScheme(entry)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
