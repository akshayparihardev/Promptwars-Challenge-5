import type { Task } from '../schemas';
import { addDays, diffDays } from './dates';

export class ScheduleError extends Error {
  readonly kind: 'cycle' | 'unknown_dependency';
  readonly ids: string[];
  constructor(kind: 'cycle' | 'unknown_dependency', ids: string[]) {
    super(kind === 'cycle' ? `Circular task dependency: ${ids.join(' -> ')}` : `Unknown dependency: ${ids.join(', ')}`);
    this.name = 'ScheduleError';
    this.kind = kind;
    this.ids = ids;
  }
}

/** Returns the ids of one dependency cycle (first id repeated at the end), or [] when acyclic. */
export function detectCycles(tasks: readonly Task[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] => {
    state.set(id, 1);
    stack.push(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dep)) continue;
      if (state.get(dep) === 1) return [...stack.slice(stack.indexOf(dep)), dep];
      if (!state.has(dep)) {
        const found = visit(dep);
        if (found.length) return found;
      }
    }
    stack.pop();
    state.set(id, 2);
    return [];
  };
  for (const t of tasks) {
    if (!state.has(t.id)) {
      const found = visit(t.id);
      if (found.length) return found;
    }
  }
  return [];
}

/** Dependencies first. Throws ScheduleError on cycles or unknown dependency ids. */
function topoOrder(tasks: readonly Task[]): Task[] {
  const ids = new Set(tasks.map((t) => t.id));
  const unknown = tasks.flatMap((t) => t.dependsOn.filter((d) => !ids.has(d)));
  if (unknown.length) throw new ScheduleError('unknown_dependency', [...new Set(unknown)]);
  const cycle = detectCycles(tasks);
  if (cycle.length) throw new ScheduleError('cycle', cycle);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: Task[] = [];
  const visit = (t: Task) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    for (const d of t.dependsOn) {
      const dep = byId.get(d);
      if (dep) visit(dep);
    }
    out.push(t);
  };
  tasks.forEach(visit);
  return out;
}

/** Effective day offset relative to the event (negative = before it), per task id. */
function effectiveOffsets(ordered: readonly Task[]): Map<string, number> {
  const eff = new Map<string, number>();
  for (const t of ordered) {
    const delay = t.status === 'done' ? 0 : (t.delayDays ?? 0);
    const own = -t.leadDays + delay;
    const depEnd = t.dependsOn.length
      ? Math.max(...t.dependsOn.map((d) => eff.get(d) ?? Number.NEGATIVE_INFINITY)) + t.durationDays
      : Number.NEGATIVE_INFINITY;
    eff.set(t.id, t.status === 'done' ? -t.leadDays : Math.max(own, depEnd));
  }
  return eff;
}

export interface ScheduledTask extends Task {
  dueDate: string;
  effectiveDate: string;
  flags: { overdue: boolean; atRisk: boolean; impossible: boolean; tooLate: boolean };
}

export function buildSchedule(tasks: readonly Task[], eventDate: string, today: string): ScheduledTask[] {
  const ordered = topoOrder(tasks);
  const eff = effectiveOffsets(ordered);
  return ordered.map((t) => {
    const dueDate = addDays(eventDate, -t.leadDays);
    const effectiveDate = addDays(eventDate, eff.get(t.id) ?? -t.leadDays);
    const done = t.status === 'done';
    return {
      ...t,
      dueDate,
      effectiveDate,
      flags: {
        overdue: !done && diffDays(effectiveDate, today) > 0,
        atRisk: !done && effectiveDate > dueDate,
        impossible: !done && effectiveDate > eventDate,
        tooLate: !done && dueDate < today,
      },
    };
  });
}

/** Ids of downstream tasks whose effective date moves if `taskId` slips by `delayDays`. */
export function propagateDelay(tasks: readonly Task[], taskId: string, delayDays: number): string[] {
  const ordered = topoOrder(tasks);
  const before = effectiveOffsets(ordered);
  const days = Math.max(0, Math.floor(delayDays));
  const after = effectiveOffsets(
    ordered.map((t) => (t.id === taskId ? { ...t, status: t.status === 'done' ? 'todo' : t.status, delayDays: days } : t)),
  );
  return ordered.filter((t) => t.id !== taskId && after.get(t.id) !== before.get(t.id)).map((t) => t.id);
}

export interface Phase {
  key: string;
  label: string;
  order: number;
}

const PHASES: { min: number; phase: Phase }[] = [
  { min: 120, phase: { key: 'p1', label: '4+ months out', order: 1 } },
  { min: 60, phase: { key: 'p2', label: '2 to 4 months out', order: 2 } },
  { min: 30, phase: { key: 'p3', label: '1 to 2 months out', order: 3 } },
  { min: 8, phase: { key: 'p4', label: 'Final month', order: 4 } },
  { min: -Infinity, phase: { key: 'p5', label: 'Final week', order: 5 } },
];

/** Chunks tasks into a few phases by how many days before the event they are due. */
export function phaseFor(leadDays: number): Phase {
  const found = PHASES.find((p) => leadDays >= p.min);
  return (found ?? PHASES[PHASES.length - 1])?.phase ?? { key: 'p5', label: 'Final week', order: 5 };
}
