import { useCallback, useMemo } from 'react';
import { useSyncedText } from '../lib/useSyncedText';
import {
  budgetStatus,
  categoryNeeds,
  formatINR,
  generateOverBudgetOptions,
  OCCASION_LABELS,
  parseINR,
  scaleGuests,
  toLakh,
} from '../engine';
import { CATEGORIES, MAX_GUESTS, type Category, type Plan } from '../schemas';
import type { Action } from '../state/planStore';
import { CategoryCard } from './CategoryCard';
import { TradeoffPanel } from './TradeoffPanel';
import { Field } from './ui';

export function BudgetTab({ plan, dispatch }: { plan: Plan; dispatch: (action: Action) => void }) {
  const status = useMemo(() => budgetStatus(plan), [plan]);
  const needs = useMemo(() => categoryNeeds(plan), [plan]);
  const options = useMemo(() => generateOverBudgetOptions(plan), [plan]);
  const impact = useMemo(() => scaleGuests(plan, plan.guests), [plan]);

  const [guestsText, setGuestsText] = useSyncedText(String(plan.guests));
  const [budgetText, setBudgetText] = useSyncedText(String(plan.totalBudget));
  const [perPlateText, setPerPlateText] = useSyncedText(String(Math.round(plan.perPlate)));

  const onChange = useCallback(
    (category: Category, amount: number) => dispatch({ type: 'setAmount', category, amount }),
    [dispatch],
  );
  const onToggleLock = useCallback(
    (category: Category) => dispatch({ type: 'toggleLock', category }),
    [dispatch],
  );

  function commitGuests(value: string) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_GUESTS)
      dispatch({ type: 'setGuests', guests: n });
    else setGuestsText(String(plan.guests));
  }
  function commitBudget() {
    const parsed = parseINR(budgetText);
    if (parsed === null) setBudgetText(String(plan.totalBudget));
    else dispatch({ type: 'setTotal', total: parsed });
  }
  function commitPerPlate() {
    const parsed = perPlateText.trim() === '0' ? 0 : parseINR(perPlateText);
    if (parsed === null) setPerPlateText(String(Math.round(plan.perPlate)));
    else dispatch({ type: 'setPerPlate', perPlate: parsed });
  }

  const over = status.overBy > 0;
  return (
    <div className="space-y-6">
      <section className="card" aria-labelledby="summary-h">
        <h2 id="summary-h" className="text-lg">
          Budget at a glance
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-ink-soft">Total budget</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatINR(status.total)}</dd>
            <dd className="text-sm text-ink-soft">{toLakh(status.total)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Committed (verified quotes)</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatINR(status.committed)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Estimated (not yet quoted)</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatINR(status.estimated)}</dd>
          </div>
        </dl>
      </section>

      <div role="status" aria-live="polite" data-testid="over-budget-region">
        {over && (
          <div className="rounded-2xl border-2 border-warn bg-warn-soft p-4 text-warn">
            <p className="font-semibold">
              <span aria-hidden="true">⚠ </span>
              Over budget by {formatINR(status.overBy)} ({status.overByPct}% of your total)
            </p>
            <p className="mt-1 text-sm">
              Your plan needs more than you have set aside. Nothing was changed automatically.
              Choose an option below.
            </p>
          </div>
        )}
      </div>

      <section className="card" aria-labelledby="controls-h">
        <h2 id="controls-h" className="text-lg">
          Guests and totals
        </h2>
        <div className="mt-3 grid gap-5 sm:grid-cols-3">
          <Field label="Number of guests">
            {(p) => (
              <input
                {...p}
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_GUESTS}
                value={guestsText}
                onChange={(e) => {
                  setGuestsText(e.target.value);
                  const n = Number(e.target.value);
                  if (Number.isInteger(n) && n >= 1 && n <= MAX_GUESTS)
                    dispatch({ type: 'setGuests', guests: n });
                }}
                onBlur={(e) => commitGuests(e.target.value)}
              />
            )}
          </Field>
          <Field label="Total budget (₹)" hint="Try 8 lakh or 8,00,000">
            {(p) => (
              <input
                {...p}
                className="input"
                value={budgetText}
                onChange={(e) => setBudgetText(e.target.value)}
                onBlur={commitBudget}
                onKeyDown={(e) => e.key === 'Enter' && commitBudget()}
              />
            )}
          </Field>
          <Field
            label="Catering cost per plate (₹)"
            hint="Starts from your catering share. Edit if you know better."
          >
            {(p) => (
              <input
                {...p}
                className="input"
                value={perPlateText}
                onChange={(e) => setPerPlateText(e.target.value)}
                onBlur={commitPerPlate}
                onKeyDown={(e) => e.key === 'Enter' && commitPerPlate()}
              />
            )}
          </Field>
        </div>
        <p className="mt-4 text-sm" data-testid="guest-impact">
          {plan.guests} guests × {formatINR(Math.round(impact.perPlate))} per plate needs{' '}
          <strong>{formatINR(impact.requiredCatering)}</strong> for catering. You have budgeted{' '}
          <strong>{formatINR(impact.currentCatering)}</strong>
          {impact.overBy > 0 ? (
            <>
              : <span className="font-semibold text-warn">⚠ {formatINR(impact.overBy)} short.</span>
            </>
          ) : (
            '. That covers it.'
          )}
        </p>
      </section>

      {over && (
        <TradeoffPanel
          plan={plan}
          options={options}
          overBy={status.overBy}
          onApply={(option) => dispatch({ type: 'applyOption', option })}
        />
      )}

      <section aria-labelledby="cats-h">
        <h2 id="cats-h" className="mb-3 text-lg">
          Where the money goes
        </h2>
        <p className="mb-4 text-sm text-ink-soft">
          Move one slider and the others adjust to keep the total the same. Lock a category to
          protect it.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {CATEGORIES.map((c) => {
            const need = needs.find((n) => n.category === c);
            if (!need) return null;
            return (
              <CategoryCard
                key={c}
                occasion={plan.occasion}
                category={c}
                amount={plan.allocation[c]}
                total={plan.totalBudget}
                locked={plan.locked.includes(c)}
                need={need}
                onChange={onChange}
                onToggleLock={onToggleLock}
              />
            );
          })}
        </div>
        <p className="mt-4 text-xs text-ink-soft">
          Splits start from typical presets for a {OCCASION_LABELS[plan.occasion].toLowerCase()} and
          stay estimates until you accept a vendor quote.
        </p>
      </section>
    </div>
  );
}
