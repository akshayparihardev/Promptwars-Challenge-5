import { categoryLabel, percentOf } from '../engine';
import { CATEGORIES, type Category, type Plan } from '../schemas';

/** Tonal palette for the split. Meaning is carried by the text legend, never by colour alone. */
export const SWATCHES: Record<Category, string> = {
  venue: 'rgb(var(--sw-venue))',
  catering: 'rgb(var(--sw-catering))',
  decor: 'rgb(var(--sw-decor))',
  photography: 'rgb(var(--sw-photography))',
  entertainment: 'rgb(var(--sw-entertainment))',
  misc: 'rgb(var(--sw-misc))',
  contingency: 'rgb(var(--sw-contingency))',
};

export function AllocationBar({ plan }: { plan: Plan }) {
  const parts = CATEGORIES.map((c) => ({
    category: c,
    label: categoryLabel(plan.occasion, c),
    amount: plan.allocation[c],
    pct: percentOf(plan.allocation[c], plan.totalBudget),
  }));
  const summary = parts.map((p) => `${p.label} ${p.pct}%`).join(', ');
  return (
    <div>
      <div
        role="img"
        aria-label={`Budget split: ${summary}`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-line"
      >
        {parts.map((p) => (
          <div
            key={p.category}
            style={{
              width: `${p.pct}%`,
              background: SWATCHES[p.category],
              transition: 'width 260ms cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {parts.map((p) => (
          <li key={p.category} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: SWATCHES[p.category] }}
            />
            <span className="truncate">{p.label}</span>
            <span className="tabular ml-auto text-ink-soft">{p.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
