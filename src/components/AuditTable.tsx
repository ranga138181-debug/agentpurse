"use client";

import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GridApi,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useRef } from "react";
import { api, formatCents } from "./api";

ModuleRegistry.registerModules([AllCommunityModule]);

const POLL_INTERVAL_MS = 1000;

interface AuditEvent {
  seq: number;
  ts: string;
  actor: string;
  event_type: string;
  decision: string | null;
  reason_codes: string[];
  payload: {
    product_id?: string;
    total_cents?: number;
    paypal_order_id?: string;
  };
}

// Cells use the grid's default text rendering, so product and model text is never treated as HTML.
const COLUMNS: ColDef<AuditEvent>[] = [
  { headerName: "Seq", field: "seq", width: 90 },
  { headerName: "Time", field: "ts" },
  { headerName: "Actor", field: "actor", width: 110 },
  { headerName: "Event", field: "event_type", filter: true },
  { headerName: "Decision", field: "decision", width: 140, filter: true },
  {
    headerName: "Reason codes",
    valueGetter: ({ data }) => data?.reason_codes.join(", "),
  },
  {
    headerName: "Product",
    valueGetter: ({ data }) => data?.payload.product_id,
  },
  {
    headerName: "Amount",
    valueGetter: ({ data }) =>
      data?.payload.total_cents === undefined
        ? ""
        : formatCents(data.payload.total_cents),
  },
  {
    headerName: "PayPal order ID",
    valueGetter: ({ data }) => data?.payload.paypal_order_id,
  },
];

export function AuditTable() {
  const grid = useRef<GridApi<AuditEvent> | null>(null);

  useEffect(() => {
    let cursor = 0;
    let polling = false;
    const timer = setInterval(async () => {
      if (polling || !grid.current) return;
      polling = true;
      const result = await api<{
        events: AuditEvent[];
        next_after_seq: number;
      }>(`/api/audit?after_seq=${cursor}`);
      if (result.ok && result.data.events.length > 0) {
        grid.current.applyTransaction({ add: result.data.events });
        cursor = result.data.next_after_seq;
      }
      polling = false;
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <section aria-labelledby="audit-heading">
      <h2 id="audit-heading">Audit log</h2>
      <button type="button" onClick={() => grid.current?.exportDataAsCsv()}>
        Export CSV
      </button>
      <div className="audit-grid">
        <AgGridReact<AuditEvent>
          columnDefs={COLUMNS}
          rowData={[]}
          suppressOverlays={["noRows"]}
          animateRows={false}
          getRowId={({ data }) => String(data.seq)}
          onGridReady={({ api: gridApi }) => (grid.current = gridApi)}
        />
      </div>
    </section>
  );
}
