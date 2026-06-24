// LOCAL CLI: print the weekly pulse and monthly report to stdout without
// touching Telegram. Handy for eyeballing the bookkeeper's output. Still needs
// network for market data, but no API keys.

import { gatherState } from './state.js';
import { formatWeeklyPulse, formatMonthlyReport } from './report.js';

const { report } = await gatherState();
console.log(formatWeeklyPulse(report));
console.log('\n' + '─'.repeat(48) + '\n');
console.log(formatMonthlyReport(report));
