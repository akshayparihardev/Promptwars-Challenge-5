import { useMemo } from 'react';
import { affectedByDelays, buildSchedule, diffDays, phaseFor, ScheduleError, type ScheduledTask } from '../engine';
import type { Plan } from '../schemas';
import { formatDate } from '../lib/format';
import type { Action } from '../state/planStore';
import { TaskRow } from './TaskRow';

export function TimelineTab({ plan, today, dispatch }: { plan: Plan; today: string; dispatch: (action: Action) => void }) {
  const result = useMemo(() => {
    try {
      return { schedule: buildSchedule(plan.tasks, plan.eventDate, today), error: null };
    } catch (error) {
      return { schedule: [] as ScheduledTask[], error: error instanceof ScheduleError ? error.message : 'The timeline could not be built.' };
    }
  }, [plan.tasks, plan.eventDate, today]);
  const affected = useMemo(() => {
    try {
      return affectedByDelays(plan.tasks);
    } catch {
      return {};
    }
  }, [plan.tasks]);
  const titles = useMemo(() => Object.fromEntries(plan.tasks.map((t) => [t.id, t.title])), [plan.tasks]);

  const groups = useMemo(() => {
    const map = new Map<number, { label: string; tasks: ScheduledTask[] }>();
    for (const task of result.schedule) {
      const phase = phaseFor(task.leadDays);
      const group = map.get(phase.order) ?? { label: phase.label, tasks: [] };
      group.tasks.push(task);
      map.set(phase.order, group);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([order, g]) => ({ order, ...g }));
  }, [result.schedule]);

  const daysToEvent = diffDays(today, plan.eventDate);
  const problems = result.schedule.filter((t) => t.status !== 'done' && (t.flags.atRisk || t.flags.overdue || t.flags.impossible)).length;

  if (result.error) {
    return (
      <div role="alert" className="card text-warn">
        <p className="font-semibold">⚠ {result.error}</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <section className="card" aria-labelledby="tl-h">
        <h2 id="tl-h" className="text-lg">
          Your timeline
        </h2>
        <p className="mt-1 text-sm">
          Event on <strong>{formatDate(plan.eventDate)}</strong>
          {daysToEvent > 0 ? ` · ${daysToEvent} days to go` : daysToEvent === 0 ? ' · today' : ' · this date has passed'}
        </p>
        <p className="hint">Delay a task and everything that depends on it moves too.</p>
        <div role="status" aria-live="polite" className="mt-2 text-sm font-medium">
          {problems > 0 ? (
            <span className="text-warn">
              <span aria-hidden="true">⚠ </span>
              {problems} {problems === 1 ? 'task needs' : 'tasks need'} attention
            </span>
          ) : (
            <span className="text-ok">
              <span aria-hidden="true">✓ </span>On track
            </span>
          )}
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.order} aria-labelledby={`phase-${g.order}`}>
          <h3 id={`phase-${g.order}`} className="mb-3 text-base">
            {g.label}
          </h3>
          <ul className="space-y-3">
            {g.tasks.map((task) => {
              const cause = affected[task.id];
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  occasion={plan.occasion}
                  titles={titles}
                  pushedBy={cause ? (titles[cause] ?? null) : null}
                  onStatus={(id, status) => dispatch({ type: 'setTaskStatus', id, status })}
                  onDelay={(id, days) => dispatch({ type: 'setDelay', id, days })}
                  onAssignee={(id, assignee) => dispatch({ type: 'setAssignee', id, assignee })}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
