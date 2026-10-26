import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  ThinkingLevel: { MINIMAL: 'MINIMAL' },
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import { callModel, DEFAULT_MODEL } from '../../api/_lib/model';
import { toJsonSchema } from '../../api/_lib/gemini';
import { ApiFailure } from '../../api/_lib/http';
import { wrapUserText } from '../../api/_lib/prompts';

const req = { system: 's', user: 'u', jsonSchema: {} };

describe('callModel', () => {
  beforeEach(() => {
    generateContent.mockReset();
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
    expect(arg.model).toBe(DEFAULT_MODEL);
    expect(arg.config.responseMimeType).toBe('application/json');
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
    expect(String((error as Error).message)).not.toContain('test-key');
    expect(spy.mock.calls.flat().join(' ')).not.toContain('test-key');
    spy.mockRestore();
  });

  it('retries once on a busy model, but not on other errors', async () => {
    vi.useFakeTimers();
    const busy = Object.assign(new Error('high demand'), { status: 503 });
    generateContent.mockRejectedValueOnce(busy).mockResolvedValueOnce({ text: '{"ok":1}' });
    const pending = callModel(req);
    await vi.advanceTimersByTimeAsync(700);
    await expect(pending).resolves.toBe('{"ok":1}');
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[0]?.[0].config.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });

    generateContent.mockReset();
    generateContent.mockRejectedValue(busy);
    const failing = callModel(req).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(700);
    expect(await failing).toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
    expect(generateContent).toHaveBeenCalledTimes(2);

    generateContent.mockReset();
    generateContent.mockRejectedValue(Object.assign(new Error('bad'), { status: 400 }));
    await expect(callModel(req)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(generateContent).toHaveBeenCalledTimes(1);
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
