import { useEffect, useState } from 'react';
import { ensureSeeded } from './db/db';
import { da } from './i18n/da';
import { ProgramScreen } from './screens/ProgramScreen';
import { TrainScreen } from './screens/TrainScreen';
import { BodyScreen } from './screens/BodyScreen';
import { StatsScreen } from './screens/StatsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PwaUpdater } from './components/PwaUpdater';

type Tab = 'train' | 'body' | 'stats' | 'program' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'train', label: da.nav.train, icon: '🏋️' },
  { id: 'body', label: da.nav.body, icon: '📏' },
  { id: 'stats', label: da.nav.stats, icon: '📈' },
  { id: 'program', label: da.nav.program, icon: '📋' },
  { id: 'settings', label: da.nav.settings, icon: '⚙️' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('train');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureSeeded().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        {da.app.loading}
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-20">
      <PwaUpdater />
      <main className="safe-top">
        {tab === 'train' ? <TrainScreen /> : null}
        {tab === 'body' ? <BodyScreen /> : null}
        {tab === 'stats' ? <StatsScreen /> : null}
        {tab === 'program' ? <ProgramScreen /> : null}
        {tab === 'settings' ? <SettingsScreen /> : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-600 bg-ink-800/95 backdrop-blur safe-bottom">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
              className={`flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                tab === item.id ? 'text-accent' : 'text-slate-400'
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
