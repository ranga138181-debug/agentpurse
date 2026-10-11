export interface Impact {
  checked: number;
  blocked: number;
  stoppedCents: number;
  settled: number;
}

interface ImpactEvent {
  event_type: string;
  decision: string | null;
  reason_codes: string[];
  payload: { total_cents?: number | null };
}

export const EMPTY_IMPACT: Impact = {
  checked: 0,
  blocked: 0,
  stoppedCents: 0,
  settled: 0,
};

export function addEvents(impact: Impact, events: ImpactEvent[]): Impact {
  return events.reduce((sum, event) => {
    if (event.event_type === "ORDER_CAPTURED") {
      return { ...sum, settled: sum.settled + 1 };
    }
    if (event.event_type !== "POLICY_DECISION") return sum;
    const blocked = event.decision === "BLOCK";
    const overBudget = event.reason_codes.includes("OVER_BUDGET");
    return {
      ...sum,
      checked: sum.checked + 1,
      blocked: sum.blocked + (blocked ? 1 : 0),
      stoppedCents:
        sum.stoppedCents + (overBudget ? (event.payload.total_cents ?? 0) : 0),
    };
  }, impact);
}
