import type { ModelAdapter } from "./adapter";
import { fakeAdapter } from "./fake";

export const AI_PROVIDERS = ["fake"] as const;

export function createModelAdapter(
  provider: (typeof AI_PROVIDERS)[number],
): ModelAdapter {
  return { fake: fakeAdapter }[provider];
}
