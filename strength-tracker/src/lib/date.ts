/** Date helpers. Everything is local time; dates are stored as "YYYY-MM-DD". */

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function fromIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(iso: string, days: number): string {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = fromIsoDate(toIso).getTime() - fromIsoDate(fromIso).getTime();
  return Math.round(ms / 86_400_000);
}

/** Monday of the ISO week containing the given date. */
export function startOfWeek(iso: string): string {
  const date = fromIsoDate(iso);
  const weekday = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - weekday);
  return toIsoDate(date);
}

/** ISO-8601 week label, e.g. "2026-U33". */
export function isoWeekLabel(iso: string): string {
  const date = fromIsoDate(iso);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Shift to the Thursday of this week: its year is the ISO week-numbering year.
  target.setDate(target.getDate() - ((target.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${target.getFullYear()}-U${String(week).padStart(2, '0')}`;
}

/** "11. aug." — short Danish date for chart axes and list rows. */
const DA_MONTHS_SHORT = [
  'jan.',
  'feb.',
  'mar.',
  'apr.',
  'maj',
  'jun.',
  'jul.',
  'aug.',
  'sep.',
  'okt.',
  'nov.',
  'dec.',
];

export function formatShortDate(iso: string): string {
  const date = fromIsoDate(iso);
  return `${date.getDate()}. ${DA_MONTHS_SHORT[date.getMonth()]}`;
}

const DA_WEEKDAYS = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];

export function formatLongDate(iso: string): string {
  const date = fromIsoDate(iso);
  const weekday = DA_WEEKDAYS[(date.getDay() + 6) % 7];
  return `${weekday} ${date.getDate()}. ${DA_MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
