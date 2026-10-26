import { useState } from 'react';
import {
  categoryLabel,
  compareQuote,
  effectiveCost,
  formatINR,
  inquiryDraft,
  missingFields,
} from '../engine';
import { CATEGORIES, MAX_QUOTES_PER_CATEGORY, type Category, type Plan, type Quote } from '../schemas';
import { extractQuote } from '../lib/api';
import { newId } from '../lib/today';
import { useAiCall } from '../lib/useAiCall';
import type { Action } from '../state/planStore';
import { AiError, AiLoading } from './ui';

const QUOTE_CATEGORIES = CATEGORIES.filter((c): c is Category => c !== 'contingency');

const text = (v: string | number | null, fallback = 'Not stated') => (v === null ? fallback : String(v));

function QuoteFacts({ quote, guests }: { quote: Quote; guests: number }) {
  const rows: [string, string][] = [
    ['Vendor', text(quote.vendorName)],
    ['Total price', quote.totalPrice === null ? 'Not stated' : formatINR(quote.totalPrice)],
    ['Price per plate', quote.pricePerPlate === null ? 'Not stated' : formatINR(quote.pricePerPlate)],
    ['Guest minimum', text(quote.guestMinimum)],
    ['Overtime fee per hour', quote.overtimeFeePerHour === null ? 'Not stated' : formatINR(quote.overtimeFeePerHour)],
    ['Tax included', quote.taxIncluded === null ? 'Not stated' : quote.taxIncluded ? 'Yes' : 'No, extra'],
    ['Advance', quote.advancePercent === null ? 'Not stated' : `${quote.advancePercent}%`],
    ['Inclusions', quote.inclusions.length ? quote.inclusions.join(', ') : 'Not stated'],
    ['Exclusions', quote.exclusions.length ? quote.exclusions.join(', ') : 'Not stated'],
    ['Cancellation', text(quote.cancellationPolicy)],
  ];
  const cost = effectiveCost(quote, guests);
  return (
    <table>
      <caption className="sr-only">Details found in the quote</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row" className="w-2/5 font-medium text-ink-soft">
              {k}
            </th>
            <td>{v}</td>
          </tr>
        ))}
        <tr>
          <th scope="row">Effective cost for {guests} guests</th>
          <td className="font-semibold">{cost === null ? 'Cannot be worked out yet' : formatINR(cost)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function QuoteAnalyzer({ plan, dispatch }: { plan: Plan; dispatch: (action: Action) => void }) {
  const [category, setCategory] = useState<Category>('catering');
  const [pasted, setPasted] = useState('');
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const ai = useAiCall(extractQuote);

  const result: Quote | null = ai.state.status === 'done' ? ai.state.data : null;
  const full = plan.quotes.filter((q) => q.category === category).length >= MAX_QUOTES_PER_CATEGORY;
  const analyze = () => {
    setSaved(null);
    setCopied(null);
    return ai.run(pasted, category);
  };

  async function copyDraft(quote: Quote) {
    const draft = inquiryDraft(quote, plan);
    try {
      await navigator.clipboard.writeText(draft);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  }

  function save(quote: Quote, accept: boolean) {
    dispatch({ type: 'addQuote', quote, id: newId(), accept });
    setSaved(accept ? 'Quote accepted. This category now shows a verified quote.' : 'Saved for comparison.');
    ai.reset();
    setPasted('');
  }

  const flags = result ? compareQuote(result, plan) : [];
  const missing = result ? missingFields(result) : [];
  const cost = result ? effectiveCost(result, plan.guests) : null;

  return (
    <section className="card" aria-labelledby="analyze-h">
      <h2 id="analyze-h" className="text-lg">
        Paste a vendor quote
      </h2>
      <p className="hint">Copy the message or PDF text your vendor sent. We pull out the details and flag the fine print.</p>
      <div className="mt-4 grid gap-4">
        <div>
          <label htmlFor="quote-cat" className="label">
            What is this quote for?
          </label>
          <select id="quote-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {QUOTE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(plan.occasion, c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="quote-text" className="label">
            Quote text
          </label>
          <textarea
            id="quote-text"
            className="input min-h-36"
            maxLength={6000}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Paste the vendor's message here…"
          />
          <p className="hint">{pasted.length}/6000 characters</p>
        </div>
        <div>
          <button type="button" className="btn-primary w-full sm:w-auto" disabled={pasted.trim() === '' || ai.state.status === 'loading'} onClick={() => void analyze()}>
            Analyze quote
          </button>
        </div>
      </div>

      <div aria-live="polite" className="mt-4">
        {ai.state.status === 'loading' && <AiLoading label="Reading the quote…" />}
        {ai.state.status === 'error' && <AiError message={ai.state.message} onRetry={() => void analyze()} />}
        {saved && <p className="font-medium text-ok">✓ {saved}</p>}
      </div>

      {result && (
        <div className="mt-4 space-y-4" data-testid="quote-result">
          <h3 className="text-base">What we found (AI extraction, please verify)</h3>
          <QuoteFacts quote={{ ...result, category }} guests={plan.guests} />

          {cost !== null && (
            <p className="text-sm">
              Effective cost <strong>{formatINR(cost)}</strong> against a {categoryLabel(plan.occasion, category)} budget of{' '}
              <strong>{formatINR(plan.allocation[category])}</strong>.
            </p>
          )}

          <div role="status" aria-live="polite">
            <h4 className="font-semibold">Things to check</h4>
            {flags.length === 0 ? (
              <p className="text-sm text-ok">✓ Nothing worrying found.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {flags.map((f) => (
                  <li key={f.code} className="text-warn">
                    <span aria-hidden="true">⚠ </span>
                    {f.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {missing.length > 0 && <p className="text-sm text-ink-soft">{missing.length} details are missing. Copy the message below to ask for exactly those.</p>}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => void copyDraft(result)}>
              Copy inquiry message
            </button>
            <button type="button" className="btn-secondary" disabled={full} onClick={() => save({ ...result, category }, false)}>
              Save for comparison
            </button>
            <button type="button" className="btn-primary" disabled={full || cost === null} onClick={() => save({ ...result, category }, true)}>
              Accept quote
            </button>
          </div>
          {full && <p className="text-sm text-ink-soft">You already have {MAX_QUOTES_PER_CATEGORY} quotes for this category. Remove one below to add another.</p>}
          {cost === null && <p className="text-sm text-ink-soft">A quote needs a price before it can be accepted.</p>}
          <div aria-live="polite">
            {copied === 'done' && <p className="text-sm font-medium text-ok">✓ Message copied.</p>}
            {copied === 'failed' && (
              <div>
                <p className="text-sm font-medium">Copy was blocked. Select the message below and copy it:</p>
                <textarea readOnly aria-label="Inquiry message" className="input mt-1 min-h-32" value={inquiryDraft({ ...result, category }, plan)} />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
