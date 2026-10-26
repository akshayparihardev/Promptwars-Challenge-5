import { useId, type ReactNode } from 'react';

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
        <p id={errorId} className="mt-1 text-sm font-medium text-warn">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}

export function EstimateBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="badge-verified">
      <span aria-hidden="true">✓</span> Verified quote
    </span>
  ) : (
    <span className="badge-estimate">Estimate</span>
  );
}

/** Loading skeleton plus text so the wait is explained, never just a blank space. */
export function AiLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2" data-testid="ai-loading">
      <p className="text-sm font-medium text-accent">{label}</p>
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
      <p className="font-medium">
        <span aria-hidden="true">⚠ </span>
        {message}
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
    <div className="card text-center">
      <p className="text-lg font-semibold">{title}</p>
      <button type="button" className="btn-primary mt-4" onClick={onAction}>
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
