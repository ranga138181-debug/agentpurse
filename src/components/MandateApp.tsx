"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Product } from "@/agent/search/product";
import { api, formatCents, type ApiError, type Mandate } from "./api";
import { CandidateCard } from "./CandidateCard";
import { errorMessage } from "./messages";
import { PayPalCheckout } from "./PayPalCheckout";
import { StorePanel } from "./StorePanel";

const SAMPLES = [
  "Gift for mom, max $40, delivered by Friday",
  "Headphones, max $50",
  "Vegan wallet for dad, max $50, nothing leather",
];

interface MandateAppProps {
  nonce?: string;
  products: Product[];
  liveTerms?: string;
}

export function MandateApp({ nonce, products, liveTerms }: MandateAppProps) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [sentLive, setSentLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const fail = (apiError: ApiError) => setError(errorMessage(apiError));
  const result = useRef<HTMLHeadingElement>(null);
  const mandateId = mandate?.id;
  // Keyboard and screen-reader users continue from the new result, not from the composer below it.
  useEffect(() => result.current?.focus(), [mandateId]);

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
    setSent(text);
    setSentLive(live);
    setText("");
    return run("/api/mandates", {
      text,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(live && { source: "live" }),
    });
  }

  const decide = (body: object) =>
    run(`/api/mandates/${mandate?.id}/approval`, body);
  const approved = mandate?.candidates.find(
    (candidate) => candidate.id === mandate.approved_candidate_id,
  );

  const picked = mandate?.candidates.find(
    (candidate) =>
      candidate.id ===
      (mandate.approved_candidate_id ?? mandate.pick_candidate_id),
  );

  return (
    <>
      <section aria-labelledby="agent-heading" className="agent">
        <h2 id="agent-heading">Shopping agent</h2>
        <p className="hint">Proposes only. You approve.</p>
        <div role="log" aria-label="Conversation" className="thread">
          {sent && <p className="message user">{sent}</p>}
          {busy && !mandate && <p className="message">Working…</p>}
          <p role="alert" className="message error">
            {error}
          </p>
          {mandate && (
            <div className="message result">
              <h3 ref={result} tabIndex={-1}>
                Result
              </h3>
              {mandate.constraints && (
                <dl>
                  <dt>Budget</dt>
                  <dd>{formatCents(mandate.constraints.max_total_cents)}</dd>
                  <dt>Deliver by</dt>
                  <dd>{mandate.constraints.deliver_by ?? "No deadline"}</dd>
                  <dt>Exclusions</dt>
                  <dd>
                    {mandate.constraints.exclude_terms.join(", ") || "None"}
                  </dd>
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
                  nonce={nonce}
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
            </div>
          )}
        </div>
        <form onSubmit={submit}>
          <label htmlFor="mandate-text">
            What should the agent buy, and for how much?
          </label>
          <textarea
            id="mandate-text"
            value={text}
            maxLength={500}
            rows={2}
            placeholder="Gift for mom, max $40, delivered by Friday"
            onChange={(event) => setText(event.target.value)}
          />
          {liveTerms && (
            <fieldset>
              <legend>Catalog</legend>
              <label>
                <input
                  type="radio"
                  name="source"
                  checked={!live}
                  onChange={() => setLive(false)}
                />
                Demo store
              </label>
              <label>
                <input
                  type="radio"
                  name="source"
                  checked={live}
                  onChange={() => setLive(true)}
                />
                Live products (Channel3)
              </label>
            </fieldset>
          )}
          <fieldset>
            <legend>Sample mandates</legend>
            {SAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setText(sample)}
              >
                {sample}
              </button>
            ))}
          </fieldset>
          <button type="submit" className="primary" disabled={busy}>
            Send
          </button>
        </form>
      </section>
      <StorePanel
        tiles={live ? (sentLive && mandate?.candidates) || [] : products}
        pickedId={picked?.product_id}
        terms={live ? liveTerms : undefined}
      />
    </>
  );
}
