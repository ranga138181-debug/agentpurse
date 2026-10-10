import type { ModelAdapter } from "./adapter";
import { fakeAdapter } from "./fake";
import { createGoogleAdapter } from "./google";

export const AI_PROVIDERS = ["fake", "google"] as const;

export interface ModelSettings {
  AI_PROVIDER: (typeof AI_PROVIDERS)[number];
  AI_MODEL?: string;
  AI_API_KEY?: string;
}

export function createModelAdapter(settings: ModelSettings): ModelAdapter {
  if (settings.AI_PROVIDER === "fake") return fakeAdapter;
  return createGoogleAdapter(
    settings.AI_MODEL as string,
    settings.AI_API_KEY as string,
  );
}
