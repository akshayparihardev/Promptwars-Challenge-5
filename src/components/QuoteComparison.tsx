import { categoryLabel, compareQuote, effectiveCost, formatINR } from '../engine';
import { CATEGORIES, type Category, type Plan, type StoredQuote } from '../schemas';
import type { Action } from '../state/planStore';
import { EstimateBadge } from './ui';

function CategoryTable({
  plan,
  category,
  quotes,
  dispatch,
}: {
  plan: Plan;
  category: Category;
  quotes: StoredQuote[];
  dispatch: (a: Action) => void;
}) {
  const label = categoryLabel(plan.occasion, category);
  const budget = plan.allocation[category];
  const cols = quotes.map((s) => {
    const cost = effectiveCost(s.quote, plan.guests);
    return { s, cost, flags: compareQuote(s.quote, plan) };
  });
  const cell = (render: (c: (typeof cols)[number]) => React.ReactNode) =>
    cols.map((c) => <td key={c.s.id}>{render(c)}</td>);

  return (
    <section className="card overflow-x-auto" aria-labelledby={`cmp-${category}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`cmp-${category}`} className="text-base">
          {label}: compare quotes
        </h3>
        <EstimateBadge verified={quotes.some((q) => q.accepted)} />
      </div>
      <p className="hint">Budget for this category: {formatINR(budget)}</p>
      <table className="mt-2 min-w-[28rem]">
        <caption className="sr-only">Side-by-side quotes for {label}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Detail</span>
            </th>
            {cols.map((c, i) => (
              <th key={c.s.id} scope="col">
                {c.s.quote.vendorName ?? `Quote ${i + 1}`}
                {c.s.accepted && <span className="badge-verified ml-2">✓ Accepted</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Effective cost for {plan.guests} guests</th>
            {cell((c) => (c.cost === null ? 'Not stated' : <strong>{formatINR(c.cost)}</strong>))}
          </tr>
          <tr>
            <th scope="row">Against budget</th>
            {cell((c) =>
              c.cost === null ? (
                '-'
              ) : c.cost > budget ? (
                <span className="font-medium text-warn">⚠ {formatINR(c.cost - budget)} over</span>
              ) : (
                <span className="text-ok">✓ {formatINR(budget - c.cost)} under</span>
              ),
            )}
          </tr>
          <tr>
            <th scope="row">Per plate</th>
            {cell((c) =>
              c.s.quote.pricePerPlate === null ? '-' : formatINR(c.s.quote.pricePerPlate),
            )}
          </tr>
          <tr>
            <th scope="row">Guest minimum</th>
            {cell((c) => c.s.quote.guestMinimum ?? '-')}
          </tr>
          <tr>
            <th scope="row">Advance</th>
            {cell((c) =>
              c.s.quote.advancePercent === null ? '-' : `${c.s.quote.advancePercent}%`,
            )}
          </tr>
          <tr>
            <th scope="row">Tax</th>
            {cell((c) =>
              c.s.quote.taxIncluded === null
                ? 'Not stated'
                : c.s.quote.taxIncluded
                  ? 'Included'
                  : 'Extra',
            )}
          </tr>
          <tr>
            <th scope="row">Things to check</th>
            {cell((c) =>
              c.flags.length === 0 ? (
                <span className="text-ok">✓ None</span>
              ) : (
                <ul className="space-y-1">
                  {c.flags.map((f) => (
                    <li key={f.code} className="text-warn">
                      <span aria-hidden="true">⚠ </span>
                      {f.message}
                    </li>
                  ))}
                </ul>
              ),
            )}
          </tr>
          <tr>
            <th scope="row">Actions</th>
            {cell((c) => (
              <div className="flex flex-wrap gap-2">
                {!c.s.accepted && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={c.cost === null}
                    onClick={() => dispatch({ type: 'acceptQuote', id: c.s.id })}
                  >
                    Accept
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => dispatch({ type: 'removeQuote', id: c.s.id })}
                >
                  Remove
                </button>
              </div>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export function QuoteComparison({ plan, dispatch }: { plan: Plan; dispatch: (a: Action) => void }) {
  const groups = CATEGORIES.map((c) => ({
    c,
    quotes: plan.quotes.filter((q) => q.category === c),
  })).filter((g) => g.quotes.length > 0);
  if (groups.length === 0) {
    return (
      <p className="card text-sm text-ink-soft">
        No quotes saved yet. Analyze a quote above and save it to compare up to three vendors per
        category.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <CategoryTable key={g.c} plan={plan} category={g.c} quotes={g.quotes} dispatch={dispatch} />
      ))}
    </div>
  );
}
