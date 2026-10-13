import { CANDIDATE_REASONS, MANDATE_REASONS } from "./messages";

const MAX_ENTRIES = 6;

interface PassbookEvent {
  seq: number;
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
}

type Wording = Pick<PassbookEntry, "label" | "detail" | "tone">;

function wording(event: PassbookEvent): Wording | null {
  const title = event.payload.title ?? "a product";
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

function toEntry(event: PassbookEvent): PassbookEntry[] {
  const words = wording(event);
  if (!words) return [];
  const { total_cents } = event.payload;
  return [
    {
      seq: event.seq,
      label: words.label,
      ...(words.detail && { detail: words.detail }),
      ...(typeof total_cents === "number" && { amountCents: total_cents }),
      tone: words.tone,
    },
  ];
}

// Newest first, keeping only the most recent entries.
export function addEntries(
  entries: PassbookEntry[],
  events: PassbookEvent[],
): PassbookEntry[] {
  return [...events.flatMap(toEntry).reverse(), ...entries].slice(
    0,
    MAX_ENTRIES,
  );
}
