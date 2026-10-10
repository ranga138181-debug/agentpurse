import { decide, type Decision } from "./decision";

interface ApprovalCandidate {
  mandate_id: string;
  decision: string;
  reason_codes: string[];
}

// A candidate of undefined means the user is declining, which evaluates A-01 only.
export function evaluateApproval(
  mandate: { id: string; status: string },
  candidate?: ApprovalCandidate | null,
): Decision {
  if (mandate.status !== "PROPOSED") return decide(["MANDATE_NOT_PROPOSED"]);
  if (candidate === undefined) return decide([]);
  if (candidate === null || candidate.mandate_id !== mandate.id) {
    return decide(["NOT_FOUND"]);
  }
  if (candidate.decision !== "ALLOW") {
    // A blocked candidate always carries reasons; the fallback keeps this fail-closed.
    return decide(
      candidate.reason_codes.length > 0
        ? candidate.reason_codes
        : ["POLICY_BLOCKED"],
    );
  }
  return decide([]);
}
