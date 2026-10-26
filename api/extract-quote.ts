import { ExtractedQuoteSchema, ExtractQuoteRequestSchema } from '../src/schemas';
import { generateJson } from './_lib/gemini';
import { createHandler } from './_lib/http';
import { QUOTE_PROMPT, wrapUserText } from './_lib/prompts';

export default createHandler({
  input: ExtractQuoteRequestSchema,
  async run({ text, category }) {
    const quote = await generateJson({
      system: QUOTE_PROMPT,
      user: wrapUserText(text),
      schema: ExtractedQuoteSchema,
    });
    return { ...quote, category: category ?? 'misc' };
  },
});
