import type { ModelAdapter } from "./adapter";
import { fakeAdapter } from "./fake";
import { createGroqAdapter } from "./groq";

export const AI_PROVIDERS = ["fake", "groq"] as const;

export interface ModelSettings {
  AI_PROVIDER: (typeof AI_PROVIDERS)[number];
  AI_MODEL?: string;
  AI_API_KEY?: string;
}

export function createModelAdapter(settings: ModelSettings): ModelAdapter {
  if (settings.AI_PROVIDER === "fake") return fakeAdapter;
  return createGroqAdapter(
    settings.AI_MODEL as string,
    settings.AI_API_KEY as string,
  );
}
