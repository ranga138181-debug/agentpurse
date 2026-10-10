import { formatCents, type Candidate } from "./api";

interface CandidateCardProps {
  candidate: Candidate;
  isPick: boolean;
  canApprove: boolean;
  onApprove: (candidateId: string) => void;
}

export function CandidateCard({
  candidate,
  isPick,
  canApprove,
  onApprove,
}: CandidateCardProps) {
  const allowed = candidate.decision === "ALLOW";
  return (
    <li className={`candidate ${allowed ? "allow" : "block"}`}>
      <h3>
        {candidate.rank}. {candidate.title ?? "Untitled product"}
        {isPick && <span className="pick"> Agent&apos;s pick</span>}
      </h3>
      <p>{candidate.merchant}</p>
      <p>
        Total {formatCents(candidate.total_cents)} (item{" "}
        {formatCents(candidate.price_cents)}, shipping{" "}
        {formatCents(candidate.shipping_cents)}, tax{" "}
        {formatCents(candidate.tax_cents)})
      </p>
      <p>Delivery: {candidate.estimated_delivery_date ?? "unknown"}</p>
      {candidate.rationale && <p>{candidate.rationale}</p>}
      <p className="decision">
        {candidate.decision}
        {candidate.reason_codes.length > 0 &&
          `: ${candidate.reason_codes.join(", ")}`}
      </p>
      {allowed && canApprove && (
        <button type="button" onClick={() => onApprove(candidate.id)}>
          Approve {candidate.title}
        </button>
      )}
    </li>
  );
}
