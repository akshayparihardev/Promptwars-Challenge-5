import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { ApiFailure } from './http.js';

export const DEFAULT_MODEL = 'gemini-3.6-flash';
/** Lighter model used when the preferred one is out of quota, overloaded or retired. */
export const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
export const MODEL_TIMEOUT_MS = 15_000;

/** How long a model is set aside after a failure that only affects that model. */
export const COOLDOWN_MS = { quota: 60_000, busy: 30_000, retired: 3_600_000 } as const;

const blockedUntil = new Map<string, number>();

export function resetModelHealth(): void {
  blockedUntil.clear();
}

/**
 * Models to try, in order: GEMINI_MODEL (one name or a comma-separated list), then the default and
 * the fallback. Duplicates are removed, so the chain always has somewhere to go.
 */
export function modelChain(): string[] {
  const configured = (process.env.GEMINI_MODEL ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  return [...new Set([...configured, DEFAULT_MODEL, FALLBACK_MODEL])];
}

/** Ready models first; if all are cooling down, try them anyway, soonest to recover first. */
function attemptOrder(now: number): string[] {
  const chain = modelChain();
  const ready = chain.filter((model) => (blockedUntil.get(model) ?? 0) <= now);
  if (ready.length > 0) return ready;
  return [...chain].sort((a, b) => (blockedUntil.get(a) ?? 0) - (blockedUntil.get(b) ?? 0));
}

/** A failure that only this model has (quota, overload, retired): worth trying the next one. */
function cooldownFor(error: unknown): number | null {
  const status =
    typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
  if (status === 429) return COOLDOWN_MS.quota;
  if (status === 500 || status === 503) return COOLDOWN_MS.busy;
  if (status === 404) return COOLDOWN_MS.retired;
  return null;
}

export interface ModelRequest {
  system: string;
  user: string;
  /** JSON Schema describing the required response shape. */
  jsonSchema: Record<string, unknown>;
}

/**
 * The only place that talks to Gemini. Reads the key from the server environment, forces JSON
 * output, fails over across models and enforces one overall time budget. Errors carry codes only:
 * no prompt text, no key, no stack.
 */
export async function callModel(request: ModelRequest): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiFailure(503, 'AI_UNAVAILABLE');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ApiFailure(504, 'AI_TIMEOUT'));
    }, MODEL_TIMEOUT_MS);
  });
  const ai = new GoogleGenAI({ apiKey });
  const attempt = (model: string) =>
    ai.models.generateContent({
      model,
      contents: request.user,
      config: {
        systemInstruction: request.system,
        responseMimeType: 'application/json',
        responseJsonSchema: request.jsonSchema,
        temperature: 0.4,
        // Extraction and short writing need speed, not long reasoning.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        abortSignal: controller.signal,
      },
    });
  try {
    for (const model of attemptOrder(Date.now())) {
      try {
        const response = await Promise.race([attempt(model), timeout]);
        blockedUntil.delete(model);
        return response.text ?? '';
      } catch (error) {
        const cooldown = error instanceof ApiFailure ? null : cooldownFor(error);
        if (cooldown === null) throw error;
        blockedUntil.set(model, Date.now() + cooldown);
      }
    }
    throw new ApiFailure(503, 'AI_UNAVAILABLE');
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    console.error('gemini: request failed');
    throw new ApiFailure(503, 'AI_UNAVAILABLE');
  } finally {
    if (timer) clearTimeout(timer);
  }
}
