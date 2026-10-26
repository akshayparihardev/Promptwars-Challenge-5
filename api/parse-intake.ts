import { IntakeParseSchema, ParseIntakeRequestSchema } from '../src/schemas';
import { isValidISO } from '../src/engine/dates';
import { generateJson } from './_lib/gemini';
import { createHandler } from './_lib/http';
import { INTAKE_PROMPT, wrapUserText } from './_lib/prompts';

export default createHandler({
  input: ParseIntakeRequestSchema,
  async run({ text }) {
    const today = new Date().toISOString().slice(0, 10);
    const result = await generateJson({
      system: INTAKE_PROMPT,
      user: `Today's date: ${today}\n${wrapUserText(text)}`,
      schema: IntakeParseSchema,
    });
    return { ...result, eventDate: result.eventDate && isValidISO(result.eventDate) ? result.eventDate : null };
  },
});
