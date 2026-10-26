import { lazy, Suspense, useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { BudgetTab } from './components/BudgetTab';
import { Header } from './components/Header';
import { PlanSetup } from './components/PlanSetup';
import { PrintSummary } from './components/PrintSummary';
import { TimelineTab } from './components/TimelineTab';
import { Toast } from './components/Toast';
import { EmptyState } from './components/ui';
import { todayISO } from './lib/today';
import { loadInitial, safeStorage, usePlanStore, type InitialLoad } from './state/planStore';

const VendorsTab = lazy(() => import('./components/VendorsTab'));
const IdeasPanel = lazy(() => import('./components/IdeasPanel'));

const TABS = [
  { id: 'setup', label: 'Plan setup' },
  { id: 'budget', label: 'Budget' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'vendors', label: 'Vendors' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function readInitial(): InitialLoad {
  return loadInitial(typeof window === 'undefined' ? '' : window.location.hash, safeStorage());
}

export default function App({
  initial,
  today: todayProp,
}: {
  initial?: InitialLoad;
  today?: string;
}) {
  const [boot] = useState<InitialLoad>(() => initial ?? readInitial());
  const [today] = useState(() => todayProp ?? todayISO());
  const { state, dispatch } = usePlanStore(boot);
  const [tab, setTab] = useState<TabId>(boot.plan ? 'budget' : 'setup');
  const [notice, setNotice] = useState(boot.notice);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dismissToast = useCallback(() => dispatch({ type: 'dismissToast' }), [dispatch]);
  const plan = state.plan;

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const target = TABS[next];
    if (target) {
      setTab(target.id);
      refs.current[target.id]?.focus();
    }
  }

  const needPlan = (
    <EmptyState
      title="Create your plan first and this section comes alive."
      action="Go to Plan setup"
      onAction={() => setTab('setup')}
    />
  );

  return (
    <>
      <a
        href="#main"
        className="sr-only-focusable no-print fixed left-2 top-2 z-50 rounded-lg bg-accent px-4 py-2 font-semibold text-white"
      >
        Skip to main content
      </a>
      <Header
        plan={plan}
        onReset={() => {
          dispatch({ type: 'reset' });
          setTab('setup');
          if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
        }}
      />

      <main id="main" className="no-print mx-auto max-w-5xl px-4 pb-24 pt-6">
        {notice && (
          <div
            role="status"
            className={`mb-4 flex items-start justify-between gap-3 rounded-xl border p-3 text-sm ${notice.kind === 'bad_link' ? 'border-warn bg-warn-soft text-warn' : 'border-line bg-accent-soft'}`}
          >
            <p>
              {notice.kind === 'bad_link' && <span aria-hidden="true">⚠ </span>}
              {notice.message}
            </p>
            <button type="button" className="btn-quiet shrink-0" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        <div
          role="tablist"
          aria-label="Plan sections"
          className="mb-6 flex gap-1 rounded-2xl border border-line bg-card p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={`btn min-w-0 flex-1 px-2 text-[13px] sm:px-4 sm:text-sm ${tab === t.id ? 'bg-accent text-white' : 'text-ink hover:bg-paper'}`}
              onClick={() => setTab(t.id)}
              onKeyDown={onKeyDown}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === 'setup' && (
            <div className="space-y-6">
              <PlanSetup
                key={plan ? 'existing' : 'new'}
                today={today}
                existing={plan}
                onCreate={(created) => {
                  dispatch({ type: 'create', plan: created });
                  setTab('budget');
                }}
              />
              {plan && (
                <Suspense fallback={<p role="status">Loading ideas…</p>}>
                  <IdeasPanel plan={plan} />
                </Suspense>
              )}
            </div>
          )}
          {tab === 'budget' && (plan ? <BudgetTab plan={plan} dispatch={dispatch} /> : needPlan)}
          {tab === 'timeline' &&
            (plan ? <TimelineTab plan={plan} today={today} dispatch={dispatch} /> : needPlan)}
          {tab === 'vendors' &&
            (plan ? (
              <Suspense fallback={<p role="status">Loading vendors…</p>}>
                <VendorsTab plan={plan} dispatch={dispatch} />
              </Suspense>
            ) : (
              needPlan
            ))}
        </div>
      </main>

      {plan && <PrintSummary plan={plan} today={today} />}
      <Toast toast={state.toast} occasion={plan?.occasion ?? 'wedding'} onDismiss={dismissToast} />
    </>
  );
}
