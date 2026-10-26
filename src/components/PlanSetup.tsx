import { useState, type FormEvent } from 'react';
import {
  categoryLabel,
  createPlan,
  formatINR,
  isValidISO,
  OCCASION_LABELS,
  parseINR,
  toLakh,
} from '../engine';
import {
  CATEGORIES,
  IntakeSchema,
  MAX_GUESTS,
  OCCASIONS,
  type Category,
  type Occasion,
  type Plan,
} from '../schemas';
import { parseIntake } from '../lib/api';
import { useAiCall } from '../lib/useAiCall';
import { AiError, AiLoading, Field } from './ui';

const PRIORITY_CATEGORIES = CATEGORIES.filter((c): c is Exclude<Category, 'contingency'> => c !== 'contingency');

interface Errors {
  budget?: string;
  guests?: string;
  date?: string;
}

export function PlanSetup({
  today,
  existing,
  onCreate,
}: {
  today: string;
  existing: Plan | null;
  onCreate: (plan: Plan) => void;
}) {
  const [description, setDescription] = useState('');
  const [occasion, setOccasion] = useState<Occasion>(existing?.occasion ?? 'wedding');
  const [budgetText, setBudgetText] = useState(existing ? String(existing.totalBudget) : '');
  const [guestsText, setGuestsText] = useState(existing ? String(existing.guests) : '');
  const [date, setDate] = useState(existing?.eventDate ?? '');
  const [vibe, setVibe] = useState(existing?.vibe ?? '');
  const [priorities, setPriorities] = useState<Category[]>(existing?.priorities ?? []);
  const [errors, setErrors] = useState<Errors>({});
  const [filled, setFilled] = useState<string | null>(null);
  const ai = useAiCall(parseIntake);

  const budget = parseINR(budgetText);
  const budgetHint =
    budgetText.trim() === ''
      ? 'Type it your way: 8 lakh, 8L, 8,00,000 or 2 crore.'
      : budget !== null
        ? `Reads as ${formatINR(budget)} (${toLakh(budget)})`
        : undefined;
  const budgetError =
    budgetText.trim() !== '' && budget === null ? "Couldn't read that amount. Try 8 lakh or 8,00,000." : errors.budget;

  async function fillFromDescription() {
    setFilled(null);
    const result = await ai.run(description);
    if (!result) return;
    const found: string[] = [];
    if (result.occasion) {
      setOccasion(result.occasion);
      found.push('occasion');
    }
    if (result.totalBudget) {
      setBudgetText(String(result.totalBudget));
      found.push('budget');
    }
    if (result.guests) {
      setGuestsText(String(result.guests));
      found.push('guests');
    }
    if (result.eventDate) {
      setDate(result.eventDate);
      found.push('date');
    }
    if (result.vibe) {
      setVibe(result.vibe);
      found.push('style');
    }
    if (result.nonNegotiables.length) {
      setPriorities(result.nonNegotiables);
      found.push('priorities');
    }
    setFilled(
      found.length
        ? `Filled ${found.join(', ')}. Please check the details before creating your plan.`
        : 'We could not find event details in that text. You can fill the form below by hand.',
    );
  }

  function togglePriority(category: Category) {
    setPriorities((current) => (current.includes(category) ? current.filter((c) => c !== category) : [...current, category]));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    const guests = Number(guestsText);
    if (budget === null) next.budget = 'Enter your total budget, for example 8 lakh.';
    if (!Number.isInteger(guests) || guests < 1 || guests > MAX_GUESTS) {
      next.guests = `Enter a guest count between 1 and ${MAX_GUESTS.toLocaleString('en-IN')}.`;
    }
    if (!isValidISO(date)) next.date = 'Pick the event date.';
    else if (date < today) next.date = 'Pick today or a future date.';
    setErrors(next);
    if (Object.keys(next).length > 0 || budget === null) return;
    const parsed = IntakeSchema.safeParse({
      occasion,
      totalBudget: budget,
      guests,
      eventDate: date,
      vibe: vibe.trim() || undefined,
      priorities,
    });
    if (!parsed.success) {
      setErrors({ budget: 'Those details could not be used. Please check the budget and guest count.' });
      return;
    }
    onCreate(createPlan(parsed.data));
  }

  return (
    <div className="space-y-6">
      <section className="card" aria-labelledby="describe-h">
        <h2 id="describe-h" className="text-lg">
          Describe your event
        </h2>
        <p className="hint">Write it the way you would tell a friend. We will fill the form for you.</p>
        <label htmlFor="describe" className="sr-only">
          Event description
        </label>
        <textarea
          id="describe"
          className="input mt-3 min-h-28"
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Shaadi in Pune, 200 guests, 8 lakh budget, mid-Feb, simple ceremony but premium food"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto"
            onClick={fillFromDescription}
            disabled={description.trim() === '' || ai.state.status === 'loading'}
          >
            Fill form from description
          </button>
          <span className="text-xs text-ink-soft">{description.length}/1000 · AI suggestion, always check it</span>
        </div>
        <div className="mt-3" aria-live="polite">
          {ai.state.status === 'loading' && <AiLoading label="Reading your description…" />}
          {ai.state.status === 'error' && <AiError message={ai.state.message} onRetry={() => void fillFromDescription()} />}
          {filled && ai.state.status === 'done' && <p className="text-sm font-medium text-accent">{filled}</p>}
        </div>
      </section>

      <form className="card space-y-5" onSubmit={submit} noValidate aria-labelledby="essentials-h">
        <h2 id="essentials-h" className="text-lg">
          The essentials
        </h2>
        <Field label="Occasion">
          {(p) => (
            <select {...p} className="input" value={occasion} onChange={(e) => setOccasion(e.target.value as Occasion)}>
              {OCCASIONS.map((o) => (
                <option key={o} value={o}>
                  {OCCASION_LABELS[o]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Total budget (₹)" hint={budgetHint} error={budgetError}>
          {(p) => (
            <input {...p} className="input" inputMode="text" autoComplete="off" value={budgetText} onChange={(e) => setBudgetText(e.target.value)} />
          )}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Number of guests" error={errors.guests}>
            {(p) => (
              <input {...p} className="input" type="number" inputMode="numeric" min={1} max={MAX_GUESTS} value={guestsText} onChange={(e) => setGuestsText(e.target.value)} />
            )}
          </Field>
          <Field label="Event date" error={errors.date}>
            {(p) => <input {...p} className="input" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>

        <details className="rounded-xl border border-line p-4">
          <summary className="min-h-11 cursor-pointer font-medium">Make it yours (optional)</summary>
          <div className="mt-4 space-y-5">
            <Field label="Style or vibe" hint="For example: traditional, minimal, fun for kids.">
              {(p) => <input {...p} className="input" maxLength={200} value={vibe} onChange={(e) => setVibe(e.target.value)} />}
            </Field>
            <fieldset>
              <legend className="label">What matters most? We give these categories more of the budget.</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {PRIORITY_CATEGORIES.map((c) => (
                  <label key={c} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-paper">
                    <input type="checkbox" className="h-5 w-5 accent-accent" checked={priorities.includes(c)} onChange={() => togglePriority(c)} />
                    {categoryLabel(occasion, c)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </details>

        {existing && (
          <p className="hint">Creating a new plan replaces your current budget, timeline and vendor quotes.</p>
        )}
        <button type="submit" className="btn-primary w-full sm:w-auto">
          {existing ? 'Create new plan' : 'Create my plan'}
        </button>
      </form>
    </div>
  );
}
