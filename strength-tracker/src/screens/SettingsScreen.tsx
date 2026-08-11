import { da } from '../i18n/da';
import { EmptyState } from '../components/ui';

export function SettingsScreen() {
  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-4 text-2xl font-bold">{da.settings.title}</h1>
      <EmptyState>{da.common.noData}</EmptyState>
    </div>
  );
}
