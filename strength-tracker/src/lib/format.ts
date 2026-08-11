/** Danish number formatting: comma as decimal separator, dot for thousands. */

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('da-DK', { maximumFractionDigits }).format(value);
}

/** Weights print without trailing ",0": 80 kg, 82,5 kg. */
export function formatKg(value: number): string {
  return formatNumber(Math.round(value * 100) / 100, 2);
}

export function formatKgUnit(value: number): string {
  return `${formatKg(value)} kg`;
}

/** Tonnage gets big fast, so show it in whole kg. */
export function formatTonnage(value: number): string {
  return `${formatNumber(Math.round(value), 0)} kg`;
}

export function formatPercent(value: number): string {
  return `${formatNumber(value, 1)} %`;
}

/** Parses Danish or plain input ("82,5" and "82.5" both work). Empty → null. */
export function parseDecimal(input: string): number | null {
  const trimmed = input.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
