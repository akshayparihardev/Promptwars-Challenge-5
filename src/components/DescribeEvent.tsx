import { useState } from 'react';
import type { IntakeParse } from '../schemas';
import { parseIntake } from '../lib/api';
import { useAiCall } from '../lib/useAiCall';
import { AiError, AiLoading } from './ui';

/**
 * Free-text intake. Gemini reads the description; the parent decides which fields to fill and
 * returns their names so we can tell the user exactly what changed.
 */
export function DescribeEvent({ onParsed }: { onParsed: (result: IntakeParse) => string[] }) {
  const [description, setDescription] = useState('');
  const [filled, setFilled] = useState<string | null>(null);
  const ai = useAiCall(parseIntake);

  async function fill() {
    setFilled(null);
    const result = await ai.run(description);
    if (!result) return;
    const found = onParsed(result);
    setFilled(
      found.length
        ? `Filled ${found.join(', ')}. Please check the details before creating your plan.`
        : 'We could not find event details in that text. You can fill the form below by hand.',
    );
  }

  return (
    <section className="card lg:sticky lg:top-6" aria-labelledby="describe-h">
      <h2 id="describe-h" className="text-lg">
        Describe your event
      </h2>
      <p className="hint">
        Write it the way you would tell a friend. We will fill the form for you.
      </p>
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
          onClick={() => void fill()}
          disabled={description.trim() === '' || ai.state.status === 'loading'}
        >
          Fill form from description
        </button>
        <span className="text-xs text-ink-soft">
          {description.length}/1000 · AI suggestion, always check it
        </span>
      </div>
      <div className="mt-3" aria-live="polite">
        {ai.state.status === 'loading' && <AiLoading label="Reading your description…" />}
        {ai.state.status === 'error' && (
          <AiError message={ai.state.message} onRetry={() => void fill()} />
        )}
        {filled && ai.state.status === 'done' && (
          <p className="text-sm font-medium text-accent">{filled}</p>
        )}
      </div>
    </section>
  );
}
