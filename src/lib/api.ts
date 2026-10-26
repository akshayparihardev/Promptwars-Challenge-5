import type { ZodType } from 'zod';
import {
  ExplanationsSchema,
  IdeasSchema,
  IntakeParseSchema,
  QuoteSchema,
  type Category,
  type Explanations,
  type Ideas,
  type IntakeParse,
  type Quote,
} from '../schemas';
import type { ExplainTradeoffsRequestSchema, SuggestIdeasRequestSchema } from '../schemas';
import type { z } from 'zod';

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'too_large'
  | 'invalid_input'
  | 'ai_invalid'
  | 'ai_unavailable'
  | 'server';

const MESSAGES: Record<ApiErrorKind, string> = {
  network: 'Could not reach the AI service. Check your connection and try again.',
  timeout: 'The AI took too long to answer. Please try again.',
  rate_limited: 'Too many AI requests. Please wait a few minutes and try again.',
  too_large: 'That text is too long. Please shorten it and try again.',
  invalid_input: 'That input could not be used. Please check it and try again.',
  ai_invalid: 'The AI gave an answer we could not trust. Please try again.',
  ai_unavailable: 'AI help is unavailable right now. Everything else still works.',
  server: 'Something went wrong on our side. Please try again.',
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  constructor(kind: ApiErrorKind) {
    super(MESSAGES[kind]);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

function kindFromStatus(status: number, code: unknown): ApiErrorKind {
  if (code === 'AI_RESPONSE_INVALID') return 'ai_invalid';
  if (status === 429) return 'rate_limited';
  if (status === 413) return 'too_large';
  if (status === 400 || status === 415) return 'invalid_input';
  if (status === 504 || code === 'AI_TIMEOUT') return 'timeout';
  if (status === 503) return 'ai_unavailable';
  return 'server';
}

export const CLIENT_TIMEOUT_MS = 20_000;

async function post<T>(
  path: string,
  body: unknown,
  schema: ZodType<T>,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const response = await fetcher(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const code =
        typeof data === 'object' && data !== null && 'error' in data
          ? (data as { error: unknown }).error
          : null;
      throw new ApiError(kindFromStatus(response.status, code));
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ApiError('ai_invalid');
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('timeout');
    throw new ApiError('network');
  } finally {
    clearTimeout(timer);
  }
}

export function parseIntake(text: string, fetcher?: typeof fetch): Promise<IntakeParse> {
  return post('/api/parse-intake', { text }, IntakeParseSchema, fetcher);
}

export function extractQuote(
  text: string,
  category: Category,
  fetcher?: typeof fetch,
): Promise<Quote> {
  return post('/api/extract-quote', { text, category }, QuoteSchema, fetcher);
}

export function explainTradeoffs(
  request: z.input<typeof ExplainTradeoffsRequestSchema>,
  fetcher?: typeof fetch,
): Promise<Explanations> {
  return post('/api/explain-tradeoffs', request, ExplanationsSchema, fetcher);
}

export function suggestIdeas(
  request: z.input<typeof SuggestIdeasRequestSchema>,
  fetcher?: typeof fetch,
): Promise<Ideas> {
  return post('/api/suggest-ideas', request, IdeasSchema, fetcher);
}
