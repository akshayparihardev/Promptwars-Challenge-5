import { z } from 'zod';
import { CategorySchema, OccasionSchema, QuoteSchema } from './base';

/** Request bodies (also used by the client wrappers). */
export const ParseIntakeRequestSchema = z.object({ text: z.string().trim().min(1).max(1000) });
export const ExtractQuoteRequestSchema = z.object({
  text: z.string().trim().min(1).max(6000),
  category: CategorySchema.optional(),
});
export const ExplainOptionSchema = z.object({
  id: z.string().max(40),
  title: z.string().max(200),
  coversRupees: z.number().int().min(0),
  summary: z.string().max(400),
  warning: z.string().max(300).optional(),
});
export const ExplainTradeoffsRequestSchema = z.object({
  occasion: OccasionSchema,
  guests: z.number().int().min(1),
  totalBudget: z.number().int().min(0),
  overBy: z.number().int().min(0),
  priorities: z.array(CategorySchema).max(7),
  options: z.array(ExplainOptionSchema).min(1).max(3),
});
export const SuggestIdeasRequestSchema = z.object({
  occasion: OccasionSchema,
  vibe: z.string().max(200).default(''),
  guests: z.number().int().min(1),
  budgetTier: z.enum(['modest', 'comfortable', 'premium']),
  nonNegotiables: z.array(CategorySchema).max(7),
  variation: z.number().int().min(0).max(1000).optional(),
});

/** Gemini outputs (validated before reaching the client). */
export const IntakeParseSchema = z.object({
  occasion: OccasionSchema.nullable(),
  totalBudget: z.number().int().min(1).nullable(),
  guests: z.number().int().min(1).max(100000).nullable(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  vibe: z.string().max(200).nullable(),
  nonNegotiables: z.array(CategorySchema.exclude(['contingency'])).max(6),
  city: z.string().max(80).nullable(),
});
export type IntakeParse = z.infer<typeof IntakeParseSchema>;

export const ExtractedQuoteSchema = QuoteSchema.omit({ category: true });
export type ExtractedQuote = z.infer<typeof ExtractedQuoteSchema>;

export const ExplanationsSchema = z.object({
  explanations: z
    .array(
      z.object({
        optionId: z.string().max(40),
        summary: z.string().max(500),
        bestWhen: z.string().max(300),
      }),
    )
    .max(3),
});
export type Explanations = z.infer<typeof ExplanationsSchema>;

export const IdeasSchema = z.object({
  themes: z
    .array(z.object({ title: z.string().max(80), description: z.string().max(300) }))
    .min(1)
    .max(5),
  activities: z.array(z.string().max(200)).min(1).max(8),
  foodStyle: z.array(z.string().max(200)).min(1).max(6),
  personalTouches: z.array(z.string().max(200)).max(5),
});
export type Ideas = z.infer<typeof IdeasSchema>;
