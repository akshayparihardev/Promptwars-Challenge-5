import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export type AiState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; data: T };

/** Runs an AI request with loading/error/done state. Late responses from older calls are ignored. */
export function useAiCall<T, A extends unknown[]>(fn: (...args: A) => Promise<T>) {
  const [state, setState] = useState<AiState<T>>({ status: 'idle' });
  const latest = useRef(0);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(async (...args: A): Promise<T | null> => {
    const id = ++latest.current;
    setState({ status: 'loading' });
    try {
      const data = await fnRef.current(...args);
      if (id === latest.current) setState({ status: 'done', data });
      return data;
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
      if (id === latest.current) setState({ status: 'error', message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    latest.current += 1;
    setState({ status: 'idle' });
  }, []);

  return { state, run, reset };
}
