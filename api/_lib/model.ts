import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import type { AiStreamEvent } from '../../src/schemas/index.js';
import { ApiFailure } from './http.js';

/**
 * Models to try, best first. Each is fast on the free tier and answers in JSON mode; when one is out
 * of quota, overloaded, slow or retired, the next one answers instead.
 */
export const DEFAULT_CHAIN = [
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
] as const;
export const DEFAULT_MODEL = DEFAULT_CHAIN[0];
/** One slow model must not eat the whole budget: after this, move on to the next. */
export const ATTEMPT_TIMEOUT_MS = 9_000;
/** The whole chain stays inside this, well under the function's 30 s limit. */
export const MODEL_TIMEOUT_MS = 24_000;
/** Longest thought summary passed to the browser. */
export const MAX_THOUGHT_CHARS = 1_200;

/** How long a model is set aside after a failure that only affects that model. */
export const COOLDOWN_MS = {
  quota: 60_000,
  busy: 30_000,
  slow: 300_000,
  retired: 3_600_000,
} as const;

const blockedUntil = new Map<string, number>();

export function resetModelHealth(): void {
  blockedUntil.clear();
}

/**
 * Models to try, in order: GEMINI_MODEL (one name or a comma-separated list), then the default
 * chain. Duplicates are removed, so the chain always has somewhere to go.
 */
export function modelChain(): string[] {
  const configured = (process.env.GEMINI_MODEL ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  return [...new Set([...configured, ...DEFAULT_CHAIN])];
}

const availableAt = (model: string) => blockedUntil.get(model) ?? 0;

/** Ready models first; if all are cooling down, try them anyway, soonest to recover first. */
function attemptOrder(now: number): string[] {
  const chain = modelChain();
  const ready = chain.filter((model) => availableAt(model) <= now);
  return ready.length > 0 ? ready : [...chain].sort((a, b) => availableAt(a) - availableAt(b));
}

/** How long to set a failing model aside; null when the failure says nothing about the model. */
function cooldownFor(error: unknown): number | null {
  if (error instanceof AttemptTimeout) return COOLDOWN_MS.slow;
  const status =
    typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
  if (status === 429) return COOLDOWN_MS.quota;
  if (status === 500 || status === 503) return COOLDOWN_MS.busy;
  if (status === 404) return COOLDOWN_MS.retired;
  return null;
}

/**
 * Gemini 2.5 models take a token budget, newer ones a level. Without thoughts we keep thinking to a
 * minimum (speed); with thoughts we ask for a short think and its summaries.
 */
export function thinkingFor(model: string, withThoughts: boolean): ThinkingConfig {
  const budgeted = model.startsWith('gemini-2.5');
  if (withThoughts) {
    return budgeted
      ? { includeThoughts: true, thinkingBudget: 512 }
      : { includeThoughts: true, thinkingLevel: ThinkingLevel.LOW };
  }
  return budgeted ? { thinkingBudget: 0 } : { thinkingLevel: ThinkingLevel.MINIMAL };
}

class AttemptTimeout extends Error {}

/** Runs one attempt with its own abort signal; rejects with AttemptTimeout after `ms`. */
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AttemptTimeout());
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

export interface ModelRequest {
  system: string;
  user: string;
  /** JSON Schema describing the required response shape. */
  jsonSchema: Record<string, unknown>;
  /** When set, the model's thought summaries (and model switches) are reported as they happen. */
  onEvent?: (event: AiStreamEvent) => void;
}

/**
 * The only place that talks to Gemini. Reads the key from the server environment, forces JSON
 * output, walks the model chain (each attempt time-boxed) inside one overall budget, and optionally
 * streams the model's thought summaries. Errors carry codes only: no prompt text, no key, no stack.
 */
export async function callModel(request: ModelRequest): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiFailure(503, 'AI_UNAVAILABLE');
  const ai = new GoogleGenAI({ apiKey });
  const { onEvent } = request;

  const attempt = async (model: string, signal: AbortSignal): Promise<string> => {
    const params = {
      model,
      contents: request.user,
      config: {
        systemInstruction: request.system,
        responseMimeType: 'application/json',
        responseJsonSchema: request.jsonSchema,
        temperature: 0.4,
        thinkingConfig: thinkingFor(model, onEvent !== undefined),
        abortSignal: signal,
      },
    };
    if (!onEvent) return (await ai.models.generateContent(params)).text ?? '';
    let text = '';
    for await (const chunk of await ai.models.generateContentStream(params)) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (!part.text) continue;
        if (part.thought) onEvent({ type: 'thought', text: part.text.slice(0, MAX_THOUGHT_CHARS) });
        else text += part.text;
      }
    }
    return text;
  };

  const deadline = Date.now() + MODEL_TIMEOUT_MS;
  let timedOut = false;
  for (const [index, model] of attemptOrder(Date.now()).entries()) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    if (index > 0) onEvent?.({ type: 'fallback' });
    try {
      const text = await withTimeout(
        (signal) => attempt(model, signal),
        Math.min(ATTEMPT_TIMEOUT_MS, remaining),
      );
      blockedUntil.delete(model);
      return text;
    } catch (error) {
      if (error instanceof AttemptTimeout) timedOut = true;
      const cooldown = cooldownFor(error);
      if (cooldown !== null) blockedUntil.set(model, Date.now() + cooldown);
    }
  }
  if (timedOut) throw new ApiFailure(504, 'AI_TIMEOUT');
  console.error('gemini: every model failed');
  throw new ApiFailure(503, 'AI_UNAVAILABLE');
}
