import { CANDIDATE_REASONS, MANDATE_REASONS } from "./messages";

const MAX_ENTRIES = 6;
const NAMED_BLOCKS = 3;

interface PassbookEvent {
  seq: number;
  mandate_id?: string | null;
  event_type: string;
  decision: string | null;
  reason_codes: string[];
  payload: {
    title?: string | null;
    total_cents?: number | null;
    paypal_order_id?: string;
  };
}

export interface PassbookEntry {
  seq: number;
  label: string;
  detail?: string;
  amountCents?: number;
  tone: "allow" | "block" | "info";
  // Set on entries for blocked products, so later blocks of the same mandate join them.
  blocked?: { mandateId: string | null; titles: string[] };
}

type Wording = Pick<PassbookEntry, "label" | "detail" | "tone">;

function wording(event: PassbookEvent, title: string): Wording | null {
  const [reason] = event.reason_codes;
  switch (event.event_type) {
    case "PICK_PROPOSED":
      return { label: `Agent proposed ${title}`, tone: "info" };
    case "POLICY_DECISION":
      return event.decision === "BLOCK"
        ? {
            label: `Blocked ${title}`,
            detail: CANDIDATE_REASONS[reason],
            tone: "block",
          }
        : null;
    case "USER_APPROVED":
      return { label: `You approved ${title}`, tone: "allow" };
    case "USER_DECLINED":
      return { label: "You declined", tone: "info" };
    case "APPROVAL_BLOCKED":
    case "ORDER_BLOCKED":
      return { label: "Blocked by policy", tone: "block" };
    case "MANDATE_REJECTED":
      return {
        label: "Mandate rejected",
        detail: MANDATE_REASONS[reason],
        tone: "block",
      };
    case "ORDER_CREATED":
      return {
        label: "PayPal order created",
        detail: event.payload.paypal_order_id,
        tone: "info",
      };
    case "ORDER_CAPTURED":
      return { label: "Paid with PayPal", tone: "allow" };
    default:
      return null;
  }
}

function toEntry(event: PassbookEvent): PassbookEntry | null {
  const title = event.payload.title ?? "a product";
  const words = wording(event, title);
  if (!words) return null;
  const { total_cents } = event.payload;
  return {
    seq: event.seq,
    label: words.label,
    ...(words.detail && { detail: words.detail }),
    ...(typeof total_cents === "number" && { amountCents: total_cents }),
    tone: words.tone,
    ...(event.event_type === "POLICY_DECISION" && {
      blocked: { mandateId: event.mandate_id ?? null, titles: [title] },
    }),
  };
}

function grouped(seq: number, blocked: NonNullable<PassbookEntry["blocked"]>) {
  const { titles } = blocked;
  const named = titles.slice(0, NAMED_BLOCKS).join(", ");
  const more = titles.length - NAMED_BLOCKS;
  return {
    seq,
    label: `Blocked ${titles.length} products`,
    detail: more > 0 ? `${named} and ${more} more` : named,
    tone: "block" as const,
    blocked,
  };
}

// Newest first, keeping only the most recent entries.
export function addEntries(
  entries: PassbookEntry[],
  events: PassbookEvent[],
): PassbookEntry[] {
  return events
    .reduce((list, event) => {
      const entry = toEntry(event);
      if (!entry) return list;
      const [latest, ...rest] = list;
      if (
        entry.blocked &&
        latest?.blocked &&
        latest.blocked.mandateId === entry.blocked.mandateId
      ) {
        const titles = [...latest.blocked.titles, ...entry.blocked.titles];
        return [grouped(entry.seq, { ...latest.blocked, titles }), ...rest];
      }
      return [entry, ...list];
    }, entries)
    .slice(0, MAX_ENTRIES);
}
