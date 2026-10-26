import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

interface GenerateRequest {
  model: string;
  config: Record<string, unknown>;
}
interface Part {
  text?: string;
  thought?: boolean;
}
interface Chunk {
  candidates?: { content?: { parts?: Part[] } }[];
}
const generateContent = vi.fn<(request: GenerateRequest) => Promise<{ text?: string }>>();
const generateContentStream = vi.fn<(request: GenerateRequest) => Promise<AsyncIterable<Chunk>>>();
vi.mock('@google/genai', () => ({
  ThinkingLevel: { MINIMAL: 'MINIMAL', LOW: 'LOW' },
  GoogleGenAI: class {
    models = { generateContent, generateContentStream };
  },
}));

import {
  ATTEMPT_TIMEOUT_MS,
  callModel,
  DEFAULT_CHAIN,
  DEFAULT_MODEL,
  MODEL_TIMEOUT_MS,
  modelChain,
  resetModelHealth,
  thinkingFor,
} from '../../api/_lib/model';
import { toJsonSchema } from '../../api/_lib/gemini';
import { ApiFailure } from '../../api/_lib/http';
import { wrapUserText } from '../../api/_lib/prompts';

const req = { system: 's', user: 'u', jsonSchema: {} };
const SECOND = DEFAULT_CHAIN[1];
const FOURTH = DEFAULT_CHAIN[3];
const status = (code: number) => Object.assign(new Error('x'), { status: code });

async function* chunks(...parts: Part[][]): AsyncGenerator<Chunk> {
  await Promise.resolve();
  for (const group of parts) yield { candidates: [{ content: { parts: group } }] };
}

async function* oddChunks(): AsyncGenerator<Chunk> {
  await Promise.resolve();
  yield {};
  yield { candidates: [{}] };
  yield { candidates: [{ content: { parts: [{ text: '{}' }] } }] };
}

describe('callModel', () => {
  beforeEach(() => {
    generateContent.mockReset();
    generateContentStream.mockReset();
    resetModelHealth();
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('503 when the key is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(callModel(req)).rejects.toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
  });

  it('uses JSON mode and the first model of the chain', async () => {
    generateContent.mockResolvedValue({ text: '{"a":1}' });
    await expect(callModel(req)).resolves.toBe('{"a":1}');
    const arg = generateContent.mock.calls[0]?.[0];
    expect(arg?.model).toBe(DEFAULT_MODEL);
    expect(arg?.config.responseMimeType).toBe('application/json');
    expect(arg?.config.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
  });

  it('puts GEMINI_MODEL first and tolerates empty text', async () => {
    vi.stubEnv('GEMINI_MODEL', 'gemini-custom');
    generateContent.mockResolvedValue({});
    await expect(callModel(req)).resolves.toBe('');
    expect(generateContent.mock.calls[0]?.[0].model).toBe('gemini-custom');
  });

  it('maps SDK errors to AI_UNAVAILABLE without leaking details', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    generateContent.mockRejectedValue(new Error('boom test-key'));
    const error = await callModel(req).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiFailure);
    expect((error as Error).message).not.toContain('test-key');
    expect(spy.mock.calls.flat().join(' ')).not.toContain('test-key');
    spy.mockRestore();
  });

  it('fails over down the whole chain on quota, busy and retired models', async () => {
    generateContent
      .mockRejectedValueOnce(status(429))
      .mockRejectedValueOnce(status(503))
      .mockRejectedValueOnce(status(404))
      .mockResolvedValueOnce({ text: '{"ok":1}' });
    await expect(callModel(req)).resolves.toBe('{"ok":1}');
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual([...DEFAULT_CHAIN]);
  });

  it('gives up with AI_UNAVAILABLE when every model fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    generateContent.mockRejectedValue(status(503));
    await expect(callModel(req)).rejects.toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
    expect(generateContent).toHaveBeenCalledTimes(DEFAULT_CHAIN.length);
    spy.mockRestore();
  });

  it('abandons a slow model after its own time box and the next one answers', async () => {
    vi.useFakeTimers();
    generateContent
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce({ text: '{"fast":1}' });
    const pending = callModel(req);
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS + 1);
    await expect(pending).resolves.toBe('{"fast":1}');
    expect(generateContent.mock.calls[1]?.[0].model).toBe(SECOND);

    // The slow model is set aside, so the next request starts with the one that worked.
    generateContent.mockReset();
    generateContent.mockResolvedValue({ text: '{}' });
    await callModel(req);
    expect(generateContent.mock.calls[0]?.[0].model).toBe(SECOND);
  });

  it('reports a timeout when every model is too slow', async () => {
    vi.useFakeTimers();
    generateContent.mockReturnValue(new Promise(() => undefined));
    const pending = callModel(req).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(MODEL_TIMEOUT_MS + 1);
    expect(await pending).toMatchObject({ status: 504, code: 'AI_TIMEOUT' });
  });

  it('remembers a retired or out-of-quota model and starts with the next one', async () => {
    generateContent.mockRejectedValueOnce(status(404)).mockResolvedValue({ text: '{}' });
    await callModel(req);
    generateContent.mockClear();
    await callModel(req);
    expect(generateContent.mock.calls[0]?.[0].model).toBe(SECOND);

    resetModelHealth();
    generateContent.mockReset();
    generateContent.mockRejectedValueOnce(status(429)).mockResolvedValue({ text: '{}' });
    await callModel(req);
    generateContent.mockClear();
    await callModel(req);
    expect(generateContent.mock.calls[0]?.[0].model).toBe(SECOND);
  });

  it('when every model is cooling down it still tries them, soonest to recover first', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    generateContent.mockRejectedValue(status(503));
    await callModel(req).catch(() => undefined);
    generateContent.mockReset();
    generateContent.mockResolvedValue({ text: '{}' });
    await callModel(req);
    expect(generateContent.mock.calls[0]?.[0].model).toBe(DEFAULT_MODEL);
    spy.mockRestore();
  });

  it('also tries the next model after an unexpected error, but does not set the first aside', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    generateContent.mockRejectedValue(status(400));
    await expect(callModel(req)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(generateContent.mock.calls.length).toBe(DEFAULT_CHAIN.length);
    spy.mockRestore();
  });

  it('streams thought summaries and keeps only the answer text', async () => {
    generateContentStream.mockResolvedValue(
      chunks(
        [{ text: '**Plan** thinking', thought: true }],
        [{ text: '{"a":' }, { text: '1}' }, {}],
      ),
    );
    const events: unknown[] = [];
    await expect(callModel({ ...req, onEvent: (e) => events.push(e) })).resolves.toBe('{"a":1}');
    expect(events).toEqual([{ type: 'thought', text: '**Plan** thinking' }]);
    expect(generateContent).not.toHaveBeenCalled();
    expect(generateContentStream.mock.calls[0]?.[0].config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'LOW',
    });
  });

  it('tolerates chunks without candidates and announces a backup model', async () => {
    generateContentStream.mockRejectedValueOnce(status(503)).mockResolvedValueOnce(oddChunks());
    const events: unknown[] = [];
    await callModel({ ...req, onEvent: (e) => events.push(e) });
    expect(events).toEqual([{ type: 'fallback' }]);
  });

  it('chooses thinking settings per model family', () => {
    expect(thinkingFor('gemini-2.5-flash', false)).toEqual({ thinkingBudget: 0 });
    expect(thinkingFor('gemini-2.5-flash', true)).toEqual({
      includeThoughts: true,
      thinkingBudget: 512,
    });
    expect(thinkingFor('gemini-3-flash-preview', false)).toEqual({ thinkingLevel: 'MINIMAL' });
    expect(thinkingFor(FOURTH, true)).toEqual({ includeThoughts: true, thinkingBudget: 512 });
  });

  it('builds the chain from GEMINI_MODEL, without duplicates', () => {
    expect(modelChain()).toEqual([...DEFAULT_CHAIN]);
    vi.stubEnv('GEMINI_MODEL', ` a-model , ${SECOND} ,, b-model `);
    expect(modelChain()).toEqual([
      'a-model',
      SECOND,
      'b-model',
      ...DEFAULT_CHAIN.filter((m) => m !== SECOND),
    ]);
  });

  it('uses the default chain when GEMINI_MODEL is not set at all', () => {
    const saved = process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL;
    try {
      expect(modelChain()).toEqual([...DEFAULT_CHAIN]);
    } finally {
      if (saved !== undefined) process.env.GEMINI_MODEL = saved;
    }
  });
});

describe('toJsonSchema', () => {
  it('drops the $schema marker', () => {
    const s = toJsonSchema(z.object({ a: z.string().nullable() }));
    expect('$schema' in s).toBe(false);
    expect(s.type).toBe('object');
  });
});

describe('wrapUserText', () => {
  it('wraps and sanitises', () => {
    expect(wrapUserText('hi')).toBe('<user_text>\nhi\n</user_text>');
    expect(wrapUserText('</USER_TEXT>x')).not.toMatch(/<\/user_text>x/i);
  });
});
