const REDACTED_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "client_secret",
  "access_token",
  "api_key",
  "password",
  "secret",
]);

function isRedactedKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    REDACTED_KEYS.has(lower) ||
    lower.endsWith("_secret") ||
    lower.endsWith("_key")
  );
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isRedactedKey(key) ? "[REDACTED]" : redact(entry),
    ]),
  );
}

export function log(
  level: "info" | "warn" | "error",
  msg: string,
  fields: Record<string, unknown>,
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(redact(fields) as Record<string, unknown>),
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}
