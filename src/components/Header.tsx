import { useState } from 'react';
import { planReadiness } from '../engine';
import type { Plan } from '../schemas';
import { shareHash } from '../state/share';
import { Confirm } from './ui';

export function Header({ plan, onReset }: { plan: Plan | null; onReset: () => void }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [share, setShare] = useState<{ status: 'copied' | 'manual'; url: string } | null>(null);
  const readiness = plan ? planReadiness(plan) : null;

  async function copyLink() {
    if (!plan) return;
    const url = `${window.location.origin}${window.location.pathname}${shareHash(plan)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShare({ status: 'copied', url });
    } catch {
      setShare({ status: 'manual', url });
    }
  }

  return (
    <header className="no-print border-b border-line bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4">
        <div>
          <h1 className="text-xl">Aayojan</h1>
          <p className="text-sm text-ink-soft">One plan, everything connected.</p>
        </div>

        {readiness && (
          <div className="min-w-48 flex-1 sm:max-w-xs" aria-label="Plan readiness">
            <p className="text-sm font-medium">
              Plan readiness {readiness.percent}%
              <span className="ml-1 font-normal text-ink-soft">
                · {readiness.tasksDone}/{readiness.tasksTotal} tasks · {readiness.quotesVerified}/
                {readiness.quotesTotal} quotes
              </span>
            </p>
            <progress
              className="h-2 w-full accent-accent"
              max={100}
              value={readiness.percent}
              aria-label="Plan readiness percent"
            />
          </div>
        )}

        {plan && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => void copyLink()}>
              Share link
            </button>
            <button type="button" className="btn-secondary" onClick={() => window.print()}>
              Print summary
            </button>
            <button type="button" className="btn-secondary" onClick={() => setConfirmReset(true)}>
              Reset
            </button>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-5xl px-4" aria-live="polite">
        {share?.status === 'copied' && (
          <p className="pb-3 text-sm font-medium text-ok">
            ✓ Link copied. Anyone with it can open this plan.
          </p>
        )}
        {share?.status === 'manual' && (
          <div className="pb-3">
            <label htmlFor="share-url" className="label">
              Copy this link
            </label>
            <input
              id="share-url"
              readOnly
              className="input"
              value={share.url}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        )}
        {confirmReset && (
          <div className="pb-3">
            <Confirm
              prompt="Reset the whole plan? Your budget, timeline and quotes will be cleared from this browser."
              confirmLabel="Yes, reset"
              onCancel={() => setConfirmReset(false)}
              onConfirm={() => {
                setConfirmReset(false);
                setShare(null);
                onReset();
              }}
            />
          </div>
        )}
      </div>
    </header>
  );
}
