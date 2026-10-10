"use client";

import { useState, type FormEvent } from "react";
import { api, formatCents, type ApiError, type Mandate } from "./api";
import { CandidateCard } from "./CandidateCard";
import { errorMessage } from "./messages";
import { PayPalCheckout } from "./PayPalCheckout";

export function MandateApp() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const fail = (apiError: ApiError) => setError(errorMessage(apiError));

  async function run(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const result = await api<Mandate>(path, body);
    setBusy(false);
    if (result.ok) setMandate(result.data);
    else fail(result.error);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setMandate(null);
    return run("/api/mandates", {
      text,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }

  const decide = (body: object) =>
    run(`/api/mandates/${mandate?.id}/approval`, body);
  const approved = mandate?.candidates.find(
    (candidate) => candidate.id === mandate.approved_candidate_id,
  );

  return (
    <>
      <section aria-labelledby="mandate-heading">
        <h2 id="mandate-heading">Your mandate</h2>
        <form onSubmit={submit}>
          <label htmlFor="mandate-text">
            What should the agent buy, and for how much?
          </label>
          <textarea
            id="mandate-text"
            value={text}
            maxLength={500}
            rows={3}
            placeholder="Gift for mom, max $40, delivered by Friday"
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? "Working…" : "Find a product"}
          </button>
        </form>
        <p role="alert" className="error">
          {error}
        </p>
      </section>

      {mandate && (
        <section aria-labelledby="result-heading">
          <h2 id="result-heading">Result</h2>
          {mandate.constraints && (
            <dl>
              <dt>Budget</dt>
              <dd>{formatCents(mandate.constraints.max_total_cents)}</dd>
              <dt>Deliver by</dt>
              <dd>{mandate.constraints.deliver_by ?? "No deadline"}</dd>
              <dt>Exclusions</dt>
              <dd>{mandate.constraints.exclude_terms.join(", ") || "None"}</dd>
            </dl>
          )}
          <p className="status">
            {mandate.status === "NO_ELIGIBLE_PRODUCT" &&
              "No product meets your constraints."}
            {mandate.status === "DECLINED" && "You declined this mandate."}
            {mandate.status === "APPROVED" &&
              `Approved: ${approved?.title}. Pay ${formatCents(approved?.total_cents ?? null)} with PayPal.`}
            {mandate.status === "SETTLED" &&
              `Payment complete. PayPal order ID: ${mandate.order?.paypal_order_id}`}
          </p>
          {mandate.status === "APPROVED" && (
            <PayPalCheckout
              key={mandate.id}
              mandateId={mandate.id}
              onSettled={() => run(`/api/mandates/${mandate.id}`)}
              onError={fail}
            />
          )}
          {mandate.status === "PROPOSED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => decide({ decision: "DECLINE" })}
            >
              Decline all
            </button>
          )}
          <ol className="candidates">
            {mandate.candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                isPick={candidate.id === mandate.pick_candidate_id}
                canApprove={mandate.status === "PROPOSED" && !busy}
                onApprove={(candidate_id) =>
                  decide({ decision: "APPROVE", candidate_id })
                }
              />
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
