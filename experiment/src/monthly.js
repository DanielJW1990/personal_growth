// ENTRYPOINT: monthly full report. All numbers from the bookkeeper.

import { config } from './config.js';
import { saveLedger, appendSnapshot } from './ledger.js';
import { gatherState } from './state.js';
import { formatMonthlyReport } from './report.js';
import { sendMessage } from './telegram.js';

export async function runMonthly() {
  if (config.killSwitch) {
    await sendMessage('⏸️ Experiment paused (kill switch on).');
    return { paused: true };
  }
  const { led, report, benchLevels } = await gatherState();
  await sendMessage(formatMonthlyReport(report));

  appendSnapshot(led, {
    date: report.date,
    total_value_dkk: report.totalValueDkk,
    benchmark_levels: benchLevels,
    kind: 'monthly',
  });
  await saveLedger(led);
  return { paused: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMonthly()
    .then((r) => console.log('monthly:', JSON.stringify(r)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
