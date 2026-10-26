import { GoogleGenAI } from '@google/genai';
import { ApiFailure } from './http';

export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const MODEL_TIMEOUT_MS = 15_000;

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
  try {
    const ai = new GoogleGenAI({ apiKey });
    const call = ai.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: request.user,
      config: {
        systemInstruction: request.system,
        responseMimeType: 'application/json',
        responseJsonSchema: request.jsonSchema,
        temperature: 0.4,
        abortSignal: controller.signal,
      },
    });
    const response = await Promise.race([call, timeout]);
    return response.text ?? '';
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    console.error('gemini: request failed');
    throw new ApiFailure(503, 'AI_UNAVAILABLE');
  } finally {
    if (timer) clearTimeout(timer);
  }
}
