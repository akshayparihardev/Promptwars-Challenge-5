import type { AiProgress } from '../lib/useAiCall';
import { Icon } from './Icon';

/** Gemini's thought summaries start with a bold heading: split it from the text that follows. */
export function splitThought(text: string): { title: string | null; body: string } {
  const match = /^\s*\*\*(.+?)\*\*\s*/.exec(text);
  const title = match?.[1]?.trim() ?? null;
  const body = (match ? text.slice(match[0].length) : text).replace(/\*\*/g, '').trim();
  return { title, body };
}

function Thoughts({ thoughts }: { thoughts: string[] }) {
  return (
    <ol className="space-y-2 border-l-2 border-accent/30 pl-3">
      {thoughts.map((thought, index) => {
        const { title, body } = splitThought(thought);
        return (
          <li key={index} className="text-sm">
            {title && <p className="font-semibold">{title}</p>}
            {body && <p className="text-ink-soft">{body}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The model's own thought summaries, streamed while it works and kept (collapsed) with the answer,
 * so the family can see how Gemini reached it. Shown as text, never as HTML.
 */
export function ThinkingTrace({ progress, live }: { progress: AiProgress; live: boolean }) {
  const { thoughts, switchedModel } = progress;
  const switched = switchedModel && (
    <p className="text-xs text-ink-soft">
      The first model was busy, so a backup Gemini model took over.
    </p>
  );
  if (live) {
    return (
      <div className="mt-3 space-y-2" data-testid="thinking-live">
        {switched}
        {thoughts.length > 0 && (
          <>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <Icon name="sparkle" className="h-3.5 w-3.5 text-accent" />
              Gemini&apos;s thinking, live
            </p>
            <Thoughts thoughts={thoughts} />
          </>
        )}
      </div>
    );
  }
  if (thoughts.length === 0) return null;
  return (
    <details className="mt-3 text-sm" data-testid="thinking-done">
      <summary className="cursor-pointer font-medium text-accent">
        How Gemini thought about this ({thoughts.length} {thoughts.length === 1 ? 'step' : 'steps'})
      </summary>
      <div className="mt-2 space-y-2">
        {switched}
        <Thoughts thoughts={thoughts} />
      </div>
    </details>
  );
}
