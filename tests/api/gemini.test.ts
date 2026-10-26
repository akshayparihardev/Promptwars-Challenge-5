import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

interface GenerateRequest {
  model: string;
  config: Record<string, unknown>;
}
const generateContent = vi.fn<(request: GenerateRequest) => Promise<{ text?: string }>>();
vi.mock('@google/genai', () => ({
  ThinkingLevel: { MINIMAL: 'MINIMAL' },
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import {
  callModel,
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  modelChain,
  resetModelHealth,
} from '../../api/_lib/model';
import { toJsonSchema } from '../../api/_lib/gemini';
import { ApiFailure } from '../../api/_lib/http';
import { wrapUserText } from '../../api/_lib/prompts';

const req = { system: 's', user: 'u', jsonSchema: {} };

describe('callModel', () => {
  beforeEach(() => {
    generateContent.mockReset();
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

  it('uses JSON mode and the default model', async () => {
    generateContent.mockResolvedValue({ text: '{"a":1}' });
    await expect(callModel(req)).resolves.toBe('{"a":1}');
    const arg = generateContent.mock.calls[0]?.[0];
    expect(arg?.model).toBe(DEFAULT_MODEL);
    expect(arg?.config.responseMimeType).toBe('application/json');
  });

  it('reads the model name from env and tolerates empty text', async () => {
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

  it('fails over to the next model when one is busy, but not on other errors', async () => {
    const busy = Object.assign(new Error('high demand'), { status: 503 });
    generateContent.mockRejectedValueOnce(busy).mockResolvedValueOnce({ text: '{"ok":1}' });
    await expect(callModel(req)).resolves.toBe('{"ok":1}');
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual([
      DEFAULT_MODEL,
      FALLBACK_MODEL,
    ]);
    expect(generateContent.mock.calls[0]?.[0].config.thinkingConfig).toEqual({
      thinkingLevel: 'MINIMAL',
    });

    generateContent.mockReset();
    resetModelHealth();
    generateContent.mockRejectedValue(busy);
    expect(await callModel(req).catch((e: unknown) => e)).toMatchObject({
      status: 503,
      code: 'AI_UNAVAILABLE',
    });
    expect(generateContent).toHaveBeenCalledTimes(2);

    generateContent.mockReset();
    resetModelHealth();
    generateContent.mockRejectedValue(Object.assign(new Error('bad'), { status: 400 }));
    await expect(callModel(req)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('remembers a retired or out-of-quota model and starts with the next one', async () => {
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 404 }))
      .mockResolvedValue({ text: '{}' });
    await callModel(req);
    generateContent.mockClear();
    await callModel(req);
    expect(generateContent.mock.calls[0]?.[0].model).toBe(FALLBACK_MODEL);

    resetModelHealth();
    generateContent.mockReset();
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error('quota'), { status: 429 }))
      .mockResolvedValue({ text: '{}' });
    await callModel(req);
    generateContent.mockClear();
    await callModel(req);
    expect(generateContent.mock.calls[0]?.[0].model).toBe(FALLBACK_MODEL);
  });

  it('when every model is cooling down it still tries them, soonest to recover first', async () => {
    const quota = Object.assign(new Error('quota'), { status: 429 });
    const gone = Object.assign(new Error('gone'), { status: 404 });
    generateContent.mockRejectedValueOnce(gone).mockRejectedValueOnce(quota);
    await callModel(req).catch(() => undefined);
    generateContent.mockReset();
    generateContent.mockResolvedValue({ text: '{}' });
    await callModel(req);
    expect(generateContent.mock.calls[0]?.[0].model).toBe(FALLBACK_MODEL);
  });

  it('builds the chain from GEMINI_MODEL, without duplicates', () => {
    vi.stubEnv('GEMINI_MODEL', ' a-model , gemini-3.6-flash ,, b-model ');
    expect(modelChain()).toEqual(['a-model', 'gemini-3.6-flash', 'b-model', FALLBACK_MODEL]);
    vi.stubEnv('GEMINI_MODEL', '');
    expect(modelChain()).toEqual([DEFAULT_MODEL, FALLBACK_MODEL]);
  });

  it('times out after 15 seconds', async () => {
    vi.useFakeTimers();
    generateContent.mockReturnValue(new Promise(() => undefined));
    const pending = callModel(req).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await pending).toMatchObject({ status: 504, code: 'AI_TIMEOUT' });
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
