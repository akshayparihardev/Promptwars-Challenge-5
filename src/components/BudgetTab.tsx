import { useCallback, useMemo } from 'react';
import { useSyncedText } from '../lib/useSyncedText';
import {
  budgetStatus,
  categoryNeeds,
  formatINR,
  generateOverBudgetOptions,
  OCCASION_LABELS,
  parseGuests,
  parseINR,
  scaleGuests,
  toLakh,
} from '../engine';
import { MAX_GUESTS, type Category, type Plan } from '../schemas';
import type { Action } from '../state/planStore';
import { AllocationBar, SWATCH_CLASS } from './AllocationBar';
import { CategoryRow } from './CategoryRow';
import { Icon } from './Icon';
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
    const guests = parseGuests(value);
    if (guests === null) setGuestsText(String(plan.guests));
    else dispatch({ type: 'setGuests', guests });
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
        <h2 id="summary-h">Budget at a glance</h2>
        <dl className="mt-4 grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="py-3 sm:py-0 sm:pr-6">
            <dt className="text-sm text-ink-soft">Total budget</dt>
            <dd className="tabular font-display text-3xl">{formatINR(status.total)}</dd>
            <dd className="text-sm text-ink-soft">{toLakh(status.total)}</dd>
          </div>
          <div className="py-3 sm:px-6 sm:py-0">
            <dt className="text-sm text-ink-soft">Committed (verified quotes)</dt>
            <dd className="tabular font-display text-3xl">{formatINR(status.committed)}</dd>
          </div>
          <div className="py-3 sm:py-0 sm:pl-6">
            <dt className="text-sm text-ink-soft">Estimated (not yet quoted)</dt>
            <dd className="tabular font-display text-3xl">{formatINR(status.estimated)}</dd>
          </div>
        </dl>
        <div className="mt-6">
          <AllocationBar plan={plan} />
        </div>
      </section>

      <div role="status" aria-live="polite" data-testid="over-budget-region">
        {over && (
          <div className="flex items-start gap-3 rounded-2xl border border-warn/50 bg-warn-soft p-4 text-warn">
            <Icon name="alert" className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-semibold">
                Over budget by {formatINR(status.overBy)} ({status.overByPct}% of your total)
              </p>
              <p className="mt-1 text-sm">
                Your plan needs more than you have set aside. Nothing was changed automatically.
                Choose an option below.
              </p>
            </div>
          </div>
        )}
      </div>

      <section className="card" aria-labelledby="controls-h">
        <h2 id="controls-h">Guests and totals</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
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
                  const guests = parseGuests(e.target.value);
                  if (guests !== null) dispatch({ type: 'setGuests', guests });
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
        <p className="tabular mt-4 text-sm" data-testid="guest-impact">
          {plan.guests} guests × {formatINR(Math.round(impact.perPlate))} per plate needs{' '}
          <strong>{formatINR(impact.requiredCatering)}</strong> for catering. You have budgeted{' '}
          <strong>{formatINR(impact.currentCatering)}</strong>
          {impact.overBy > 0 ? (
            <>
              :{' '}
              <span className="inline-flex items-center gap-1 font-semibold text-warn">
                <Icon name="alert" className="h-3.5 w-3.5" />
                {formatINR(impact.overBy)} short.
              </span>
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
        <h2 id="cats-h">Where the money goes</h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">
          Move one slider and the others adjust to keep the total the same. Lock a category to
          protect it.
        </p>
        <div className="card divide-y divide-line !p-0">
          {needs.map((need) => (
            <CategoryRow
              key={need.category}
              occasion={plan.occasion}
              category={need.category}
              amount={plan.allocation[need.category]}
              total={plan.totalBudget}
              locked={plan.locked.includes(need.category)}
              need={need}
              swatchClass={SWATCH_CLASS[need.category]}
              onChange={onChange}
              onToggleLock={onToggleLock}
            />
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-soft">
          Splits start from typical presets for a {OCCASION_LABELS[plan.occasion].toLowerCase()} and
          stay estimates until you accept a vendor quote.
        </p>
      </section>
    </div>
  );
}
