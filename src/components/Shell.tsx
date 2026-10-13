"use client";

import { useCallback, useReducer } from "react";
import type { Product } from "@/agent/search/product";
import { formatCents } from "./api";
import { AuditTable, type AuditEvent } from "./AuditTable";
import { addEvents, EMPTY_IMPACT } from "./impact";
import { MandateApp } from "./MandateApp";
import { addEntries } from "./passbook";

interface ShellProps {
  nonce?: string;
  products: Product[];
  liveTerms?: string;
}

export function Shell({ nonce, products, liveTerms }: ShellProps) {
  const [impact, addToImpact] = useReducer(addEvents, EMPTY_IMPACT);
  const [entries, addToPassbook] = useReducer(addEntries, []);
  const onEvents = useCallback((events: AuditEvent[]) => {
    addToImpact(events);
    addToPassbook(events);
  }, []);
  const figures = [
    ["Products checked", impact.checked],
    ["Blocked by policy", impact.blocked],
    ["Over-budget spend stopped", formatCents(impact.stoppedCents)],
    ["Payments settled", impact.settled],
  ];

  return (
    <div className="app">
      <MandateApp nonce={nonce} products={products} liveTerms={liveTerms} />
      <section aria-labelledby="impact-heading" className="session">
        <h2 id="impact-heading">
          This session<span className="visually-hidden">: Impact</span>
        </h2>
        <dl className="impact">
          {figures.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section
        aria-labelledby="passbook-heading"
        id="passbook"
        className="passbook"
      >
        <h2 id="passbook-heading">Passbook</h2>
        {entries.length === 0 && <p className="hint">No activity yet.</p>}
        <ul>
          {entries.map((entry) => (
            <li key={entry.seq} className={entry.tone}>
              <p>
                {entry.label}
                {entry.detail && <span>{entry.detail}</span>}
              </p>
              {entry.amountCents !== undefined && (
                <p className="amount">{formatCents(entry.amountCents)}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
      <AuditTable onEvents={onEvents} />
    </div>
  );
}
