import { memo, useState } from 'react';
import { categoryLabel, formatINR, parseINR, percentOf, toLakh, type CategoryNeed } from '../engine';
import type { Category, Occasion } from '../schemas';
import { EstimateBadge } from './ui';

interface Props {
  occasion: Occasion;
  category: Category;
  amount: number;
  total: number;
  locked: boolean;
  need: CategoryNeed;
  onChange: (category: Category, amount: number) => void;
  onToggleLock: (category: Category) => void;
}

function stepFor(total: number): number {
  if (total >= 100_000) return 1000;
  if (total >= 10_000) return 100;
  return 1;
}

/** One card per category: label, badge, amount, slider, number input and lock live together. */
export const CategoryCard = memo(function CategoryCard({ occasion, category, amount, total, locked, need, onChange, onToggleLock }: Props) {
  const label = categoryLabel(occasion, category);
  const [text, setText] = useState(String(amount));
  const [invalid, setInvalid] = useState(false);
  const [seen, setSeen] = useState(amount);
  if (seen !== amount) {
    setSeen(amount);
    setText(String(amount));
    setInvalid(false);
  }

  function commit() {
    const parsed = text.trim() === '0' ? 0 : parseINR(text);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(category, parsed);
  }

  const errorId = `${category}-err`;
  return (
    <article className="card" aria-label={label}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base">{label}</h3>
        <EstimateBadge verified={need.verified} />
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {formatINR(amount)}
        <span className="ml-2 text-sm font-normal text-ink-soft">
          {percentOf(amount, total)}% · {toLakh(amount)}
        </span>
      </p>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="range"
          aria-label={`${label} amount`}
          min={0}
          max={total}
          step={stepFor(total)}
          value={amount}
          disabled={locked}
          onChange={(e) => onChange(category, Number(e.target.value))}
        />
        <button
          type="button"
          className={`btn-secondary shrink-0 ${locked ? 'border-accent bg-accent-soft' : ''}`}
          aria-pressed={locked}
          aria-label={`Lock ${label} amount`}
          onClick={() => onToggleLock(category)}
        >
          <span aria-hidden="true">{locked ? '🔒' : '🔓'}</span>
          <span>{locked ? 'Locked' : 'Lock'}</span>
        </button>
      </div>

      <div className="mt-2">
        <label htmlFor={`${category}-amt`} className="label">
          {label} amount (₹)
        </label>
        <input
          id={`${category}-amt`}
          className="input"
          inputMode="text"
          autoComplete="off"
          value={text}
          disabled={locked}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        {invalid && (
          <p id={errorId} className="mt-1 text-sm font-medium text-warn">
            <span aria-hidden="true">⚠ </span>Couldn&apos;t read that amount.
          </p>
        )}
      </div>

      {need.verified && (
        <p className="mt-2 text-sm text-ink-soft">Accepted quote: {formatINR(need.amount)}</p>
      )}
      {need.shortfall > 0 && (
        <p className="mt-2 text-sm font-medium text-warn">
          <span aria-hidden="true">⚠ </span>
          Needs {formatINR(need.amount)}, which is {formatINR(need.shortfall)} more than budgeted.
        </p>
      )}
    </article>
  );
});
