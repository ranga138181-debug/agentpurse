import type { Deadline } from "@/agent/attempt";

export function createDeadline(ms: number): Deadline {
  const start = performance.now();
  return {
    signal: AbortSignal.timeout(ms),
    remainingMs: () => ms - (performance.now() - start),
  };
}
