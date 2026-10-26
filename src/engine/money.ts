const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹8,00,000 (en-IN grouping). Negative values render as −₹x. */
export function formatINR(amount: number): string {
  const n = Math.round(amount);
  return `${n < 0 ? '−' : ''}₹${inr.format(Math.abs(n))}`;
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Compact friendly form: ₹8 lakh, ₹8.5 lakh, ₹2 crore; below one lakh uses full grouping. */
export function toLakh(amount: number): string {
  const n = Math.round(amount);
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 10_000_000) return `${sign}₹${trim(abs / 10_000_000)} crore`;
  if (abs >= 100_000) return `${sign}₹${trim(abs / 100_000)} lakh`;
  return formatINR(n);
}

/**
 * Splits `total` (integer rupees) across `weights` so the parts always sum exactly to `total`.
 * Uses the largest-remainder method; ties go to the earlier index. All-zero weights split evenly.
 */
export function largestRemainderRound(weights: readonly number[], total: number): number[] {
  const count = weights.length;
  if (count === 0) return [];
  const target = Math.max(0, Math.floor(total));
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = clean.reduce((a, b) => a + b, 0);
  const shares = sum === 0 ? clean.map(() => target / count) : clean.map((w) => (w / sum) * target);
  const floors = shares.map((s) => Math.floor(s));
  let left = target - floors.reduce((a, b) => a + b, 0);
  const order = shares
    .map((s, i) => ({ i, rem: s - Math.floor(s) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    left -= 1;
  }
  return floors;
}

const UNIT: Record<string, number> = {
  '': 1,
  l: 100_000,
  lac: 100_000,
  lacs: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
  k: 1_000,
  thousand: 1_000,
};

/**
 * Forgiving rupee parser: "8 lakh", "8L", "8,00,000", "₹800000", "8.5 lac", "2 crore", "45k".
 * Returns integer rupees, or null when the text is not a positive amount.
 */
export function parseINR(input: string): number | null {
  if (typeof input !== 'string') return null;
  const text = input
    .toLowerCase()
    .replace(/₹|rs\.?|inr/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/\/-$/, '');
  const match = /^(\d+(?:\.\d+)?|\.\d+)(l|lac|lacs|lakh|lakhs|cr|crore|crores|k|thousand)?$/.exec(text);
  if (!match) return null;
  const value = Number(match[1]) * (UNIT[match[2] ?? ''] ?? 1);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000_000_000) return null;
  return Math.round(value);
}
