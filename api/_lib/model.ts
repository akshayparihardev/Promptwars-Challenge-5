import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { ApiFailure } from './http.js';

export const DEFAULT_MODEL = 'gemini-3.6-flash';
export const MODEL_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 600;

/** Busy or briefly unavailable model: worth one quick retry inside the same time budget. */
function isTransient(error: unknown): boolean {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status: unknown }).status
      : null;
  return status === 429 || status === 500 || status === 503;
}

export interface ModelRequest {
  system: string;
  user: string;
  /** JSON Schema describing the required response shape. */
  jsonSchema: Record<string, unknown>;
}

/**
 * The only place that talks to Gemini. Reads the key from the server environment, forces JSON
 * output and enforces a hard timeout. Errors carry codes only: no prompt text, no key, no stack.
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
  const attempt = () =>
    ai.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
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
    for (let tries = 1; ; tries += 1) {
      try {
        const response = await Promise.race([attempt(), timeout]);
        return response.text ?? '';
      } catch (error) {
        if (error instanceof ApiFailure || tries >= MAX_ATTEMPTS || !isTransient(error))
          throw error;
        await Promise.race([
          new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS)),
          timeout,
        ]);
      }
    }
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    console.error('gemini: request failed');
    throw new ApiFailure(503, 'AI_UNAVAILABLE');
  } finally {
    if (timer) clearTimeout(timer);
  }
}
