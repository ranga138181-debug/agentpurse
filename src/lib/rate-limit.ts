const WINDOW_MS = 60_000;

export interface RateLimit {
  key: string;
  limit: number;
}

// In-memory fixed windows: valid for the single instance this app runs as, and reset on restart.
const counts = new Map<string, number>();
let currentWindow = -1;

export function resetRateLimits(): void {
  counts.clear();
}

export function rateLimitsFor(
  route: string,
  method: string,
  sessionId: string,
  ip: string,
): RateLimit[] {
  if (method !== "POST") return [{ key: `get:${sessionId}`, limit: 120 }];
  if (route !== "/api/mandates") {
    return [{ key: `post:${sessionId}`, limit: 30 }];
  }
  return [
    { key: `mandates:${sessionId}`, limit: 5 },
    { key: `mandates-ip:${ip}`, limit: 20 },
  ];
}

// Returns the seconds until the window resets when any limit is reached, otherwise counts the request.
export function retryAfterSeconds(
  limits: RateLimit[],
  nowMs: number,
): number | null {
  const window = Math.floor(nowMs / WINDOW_MS);
  if (window !== currentWindow) {
    counts.clear();
    currentWindow = window;
  }
  if (limits.some(({ key, limit }) => (counts.get(key) ?? 0) >= limit)) {
    return Math.ceil(((window + 1) * WINDOW_MS - nowMs) / 1000);
  }
  for (const { key } of limits) counts.set(key, (counts.get(key) ?? 0) + 1);
  return null;
}
