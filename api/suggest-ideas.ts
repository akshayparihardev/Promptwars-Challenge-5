import { IdeasSchema, SuggestIdeasRequestSchema } from '../src/schemas';
import { generateJson } from './_lib/gemini';
import { createHandler } from './_lib/http';
import { IDEAS_PROMPT, wrapUserText } from './_lib/prompts';

export default createHandler({
  input: SuggestIdeasRequestSchema,
  async run(input) {
    const { vibe, ...facts } = input;
    return generateJson({
      system: IDEAS_PROMPT,
      user: `Event facts: ${JSON.stringify(facts)}\nStyle wanted by the family:\n${wrapUserText(vibe)}\nGive a fresh set of ideas (variation ${input.variation ?? 0}).`,
      schema: IdeasSchema,
    });
  },
});
