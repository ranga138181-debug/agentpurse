import { createGroq } from "@ai-sdk/groq";
import { generateText, Output } from "ai";
import type { z } from "zod";
import { createBoundary } from "../boundary";
import { buildParsePrompt } from "../prompts/parse";
import { buildRankPrompt } from "../prompts/rank";
import { parseOutputSchema, rankOutputSchema } from "../schemas";
import type { ModelAdapter } from "./adapter";

export function createGroqAdapter(model: string, apiKey: string): ModelAdapter {
  const languageModel = createGroq({ apiKey })(model);
  const generate = async (
    schema: z.ZodType,
    prompt: string,
    abortSignal: AbortSignal,
  ) => {
    const { output } = await generateText({
      model: languageModel,
      output: Output.object({ schema }),
      prompt,
      temperature: 0,
      // The agent service owns retries and timeouts (FR-018).
      maxRetries: 0,
      abortSignal,
    });
    return output;
  };
  return {
    parseMandate: (input) =>
      generate(
        parseOutputSchema,
        buildParsePrompt(input, createBoundary([input.text])),
        input.signal,
      ),
    rankProducts: (input) =>
      generate(rankOutputSchema, buildRankPrompt(input), input.signal),
  };
}
