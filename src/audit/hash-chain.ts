import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

export interface HashedFields {
  seq: number;
  id: string;
  ts: Date;
  session_id: string | null;
  mandate_id: string | null;
  actor: string;
  event_type: string;
  decision: string | null;
  reason_codes: string[];
  payload: unknown;
}

export type ChainedEvent = HashedFields & {
  prev_hash: string | null;
  hash: string | null;
};

// Object keys are sorted at every level, so the same content always serialises identically.
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  const entries = Object.entries(value)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(",")}}`;
}

export function computeHash(prevHash: string, event: HashedFields): string {
  const content = canonicalJson({
    seq: event.seq,
    id: event.id,
    ts: event.ts,
    session_id: event.session_id,
    mandate_id: event.mandate_id,
    actor: event.actor,
    event_type: event.event_type,
    decision: event.decision,
    reason_codes: event.reason_codes,
    payload: event.payload,
  });
  return createHash("sha256")
    .update(prevHash + content)
    .digest("hex");
}

// Returns the seq of the first event that does not match the chain, or null when the chain is intact.
export function verifyChain(events: ChainedEvent[]): number | null {
  let prevHash = GENESIS_HASH;
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (
      event.prev_hash !== prevHash ||
      event.hash !== computeHash(prevHash, event)
    ) {
      return event.seq;
    }
    prevHash = event.hash;
  }
  return null;
}
