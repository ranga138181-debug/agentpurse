import { formatCents, type Candidate } from "./api";
import { CANDIDATE_REASONS } from "./messages";

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
  const heading = (
    <h4>
      {candidate.rank}. {candidate.title ?? "Untitled product"}
      {isPick && <span className="pick"> Agent&apos;s pick</span>}
    </h4>
  );
  const total = <p className="total">{formatCents(candidate.total_cents)}</p>;
  const details = (
    <>
      <p>{candidate.merchant}</p>
      <p>
        Item {formatCents(candidate.price_cents)}, shipping{" "}
        {formatCents(candidate.shipping_cents)}, tax{" "}
        {formatCents(candidate.tax_cents)}
      </p>
      <p>Delivery: {candidate.estimated_delivery_date ?? "unknown"}</p>
      {candidate.rationale && <p>{candidate.rationale}</p>}
    </>
  );

  if (candidate.decision === "BLOCK") {
    return (
      <li className="candidate block">
        <details>
          <summary>
            {heading}
            {total}
            <p className="decision">
              BLOCK: {candidate.reason_codes.join(", ")}
            </p>
            {candidate.reason_codes.map((code) => (
              <p key={code}>{CANDIDATE_REASONS[code]}</p>
            ))}
          </summary>
          {details}
        </details>
      </li>
    );
  }
  return (
    <li className="candidate allow">
      <div className="headline">
        {heading}
        {total}
      </div>
      {details}
      <p className="decision">ALLOW</p>
      {canApprove && (
        <button
          type="button"
          className="primary"
          onClick={() => onApprove(candidate.id)}
        >
          Approve {candidate.title}
        </button>
      )}
    </li>
  );
}
