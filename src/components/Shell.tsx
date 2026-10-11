"use client";

import { useReducer } from "react";
import type { Product } from "@/agent/search/product";
import { formatCents } from "./api";
import { AuditTable } from "./AuditTable";
import { addEvents, EMPTY_IMPACT } from "./impact";
import { MandateApp } from "./MandateApp";

interface ShellProps {
  nonce?: string;
  products: Product[];
}

export function Shell({ nonce, products }: ShellProps) {
  const [impact, onEvents] = useReducer(addEvents, EMPTY_IMPACT);
  const figures = [
    ["Products checked", impact.checked],
    ["Blocked by policy", impact.blocked],
    ["Over-budget spend stopped", formatCents(impact.stoppedCents)],
    ["Payments settled", impact.settled],
  ];

  return (
    <>
      <section aria-labelledby="impact-heading">
        <h2 id="impact-heading" className="visually-hidden">
          Impact
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
      <div className="panels">
        <MandateApp nonce={nonce} products={products} />
      </div>
      <AuditTable onEvents={onEvents} />
    </>
  );
}
