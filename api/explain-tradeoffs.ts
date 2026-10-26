import { ExplanationsSchema, ExplainTradeoffsRequestSchema } from '../src/schemas';
import { generateJson } from './_lib/gemini';
import { createHandler } from './_lib/http';
import { EXPLAIN_PROMPT } from './_lib/prompts';

export default createHandler({
  input: ExplainTradeoffsRequestSchema,
  async run(input) {
    const result = await generateJson({
      system: EXPLAIN_PROMPT,
      user: `Plan facts (computed by the app): ${JSON.stringify(input)}`,
      schema: ExplanationsSchema,
    });
    const known = new Set(input.options.map((o) => o.id));
    return { explanations: result.explanations.filter((e) => known.has(e.optionId)) };
  },
});
