export const POLICY_VERSION = "1.0.0";

export interface Decision {
  decision: "ALLOW" | "BLOCK";
  reason_codes: string[];
  primary_reason: string | null;
  policy_version: string;
}

export function decide(reasonCodes: string[]): Decision {
  return {
    decision: reasonCodes.length === 0 ? "ALLOW" : "BLOCK",
    reason_codes: reasonCodes,
    primary_reason: reasonCodes[0] ?? null,
    policy_version: POLICY_VERSION,
  };
}
