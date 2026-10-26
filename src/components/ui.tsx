import { useId, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 flex items-start gap-1.5 text-sm font-medium text-warn">
          <Icon name="alert" className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function EstimateBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="badge-verified">
      <Icon name="check" className="h-3 w-3" /> Verified quote
    </span>
  ) : (
    <span className="badge-estimate">Estimate</span>
  );
}

/** Loading skeleton plus text so the wait is explained, never just a blank space. */
export function AiLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2" data-testid="ai-loading">
      <p className="flex items-center gap-2 text-sm font-medium text-accent">
        <Icon name="sparkle" className="h-4 w-4" />
        {label}
      </p>
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-4 w-2/3" />
    </div>
  );
}

export function AiError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-warn/40 bg-warn-soft p-3 text-sm text-warn"
    >
      <p className="flex items-start gap-2 font-medium">
        <Icon name="alert" className="mt-0.5 h-4 w-4" />
        <span>{message}</span>
      </p>
      <button type="button" className="btn-secondary mt-2" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  action,
  onAction,
}: {
  title: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="card py-10 text-center">
      <p className="font-display text-xl">{title}</p>
      <button type="button" className="btn-primary mt-5" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

/** Inline two-step confirmation (no modal needed, works with keyboards and screen readers). */
export function Confirm({
  prompt,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  prompt: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Confirm action"
      className="mt-3 rounded-xl border border-line bg-paper p-3"
    >
      <p className="text-sm font-medium">{prompt}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
