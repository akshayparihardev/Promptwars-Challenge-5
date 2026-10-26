import { z, type ZodType } from 'zod';
import { ApiFailure } from './http.js';
import { callModel } from './model.js';

/** Gemini-friendly JSON Schema from a zod schema (drops the $schema marker). */
export function toJsonSchema(schema: ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _ignored;
  return rest;
}

/**
 * Calls the model in JSON mode and validates the result against `schema`.
 * Raw model output never leaves this function unvalidated.
 */
export async function generateJson<T>(options: {
  system: string;
  user: string;
  schema: ZodType<T>;
}): Promise<T> {
  const text = await callModel({
    system: options.system,
    user: options.user,
    jsonSchema: toJsonSchema(options.schema),
  });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiFailure(502, 'AI_RESPONSE_INVALID');
  }
  const parsed = options.schema.safeParse(raw);
  if (!parsed.success) throw new ApiFailure(502, 'AI_RESPONSE_INVALID');
  return parsed.data;
}
