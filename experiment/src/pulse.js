// ENTRYPOINT: weekly performance pulse (short). All numbers from the bookkeeper.

import { config } from './config.js';
import { saveLedger, appendSnapshot } from './ledger.js';
import { gatherState } from './state.js';
import { formatWeeklyPulse } from './report.js';
import { sendMessage } from './telegram.js';

export async function runPulse() {
  if (config.killSwitch) {
    await sendMessage('⏸️ Experiment paused (kill switch on).');
    return { paused: true };
  }
  const { led, report, benchLevels } = await gatherState();
  await sendMessage(formatWeeklyPulse(report));

  // Record this week's value so next week's "this week" delta has a baseline.
  appendSnapshot(led, {
    date: report.date,
    total_value_dkk: report.totalValueDkk,
    benchmark_levels: benchLevels,
    kind: 'pulse',
  });
  await saveLedger(led);
  return { paused: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPulse()
    .then((r) => console.log('pulse:', JSON.stringify(r)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
