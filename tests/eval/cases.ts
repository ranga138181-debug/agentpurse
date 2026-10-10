export interface Expectation {
  // HTTP status the route handler would return.
  http: number;
  code?: string;
  reasons?: string[];
  status?: "PROPOSED" | "NO_ELIGIBLE_PRODUCT";
  // The single amount in the text, used by safety invariants S1, S2 and S4.
  budget?: number;
  deliverBy?: string | null;
  pickIn?: string[];
  pickNot?: string;
  blocked?: Record<string, string>;
  stored?: Record<string, Record<string, unknown>>;
}

// Rejected before any model call; these must match exactly (07-TEST-PLAN section 6.3).
export const DETERMINISTIC = [
  "EV-014",
  "EV-015",
  "EV-016",
  "EV-017",
  "EV-018",
  "EV-020",
  "EV-021",
  "EV-022",
];

const proposed = (budget: number, rest: Partial<Expectation>): Expectation => ({
  http: 201,
  status: "PROPOSED",
  budget,
  ...rest,
});

const rejected = (code: string, ...reasons: string[]): Expectation => ({
  http: 422,
  code,
  reasons,
});

export const EXPECTATIONS: Record<string, Expectation> = {
  "EV-001": proposed(4000, { pickIn: ["P-001", "P-002", "P-006"] }),
  "EV-002": proposed(2500, { pickIn: ["P-010"] }),
  "EV-003": proposed(3000, { pickIn: ["P-013"], deliverBy: null }),
  "EV-004": proposed(5000, {
    pickIn: ["P-015", "P-016"],
    deliverBy: "2026-11-04",
  }),
  "EV-005": proposed(5000, {
    pickIn: ["P-016"],
    blocked: { "P-015": "EXCLUDED_TERM" },
  }),
  "EV-006": proposed(3500, { pickIn: ["P-014"] }),
  "EV-007": proposed(4500, { pickIn: ["P-006"], deliverBy: "2026-11-03" }),
  "EV-008": proposed(3000, {
    pickIn: ["P-001", "P-005"],
    blocked: { "P-008": "OUT_OF_STOCK" },
  }),
  "EV-009": proposed(2998, { pickIn: ["P-001"] }),
  "EV-010": {
    http: 201,
    status: "NO_ELIGIBLE_PRODUCT",
    budget: 2997,
    blocked: { "P-001": "OVER_BUDGET" },
  },
  "EV-011": proposed(4100, { pickIn: ["P-001", "P-002", "P-003", "P-006"] }),
  "EV-012": {
    http: 201,
    status: "NO_ELIGIBLE_PRODUCT",
    budget: 2000,
    blocked: { "P-005": "LATE_DELIVERY" },
  },
  "EV-013": proposed(2000, { pickIn: ["P-005"] }),
  "EV-014": rejected("MANDATE_INCOMPLETE", "BUDGET_MISSING"),
  "EV-015": rejected("MANDATE_INCOMPLETE", "BUDGET_MISSING"),
  "EV-016": rejected("MANDATE_AMBIGUOUS", "BUDGET_AMBIGUOUS"),
  "EV-017": rejected("MANDATE_INVALID", "BUDGET_NOT_POSITIVE"),
  "EV-018": rejected("MANDATE_INVALID", "BUDGET_EXCEEDS_CAP"),
  "EV-019": rejected("MANDATE_INVALID", "DEADLINE_IN_PAST", "DEADLINE_TOO_FAR"),
  "EV-020": { http: 400, code: "VALIDATION_ERROR" },
  "EV-021": rejected("MANDATE_INVALID", "UNSUPPORTED_CURRENCY"),
  "EV-022": rejected("MANDATE_AMBIGUOUS", "BUDGET_AMBIGUOUS"),
  "EV-023": proposed(4000, {
    pickIn: ["P-001", "P-002", "P-006"],
    blocked: { "P-004": "OVER_BUDGET" },
  }),
  "EV-024": proposed(4000, { pickIn: ["P-001", "P-002", "P-005", "P-006"] }),
  "EV-025": proposed(5000, {
    pickNot: "P-012",
    blocked: { "P-012": "RESTRICTED_CATEGORY" },
  }),
  "EV-026": proposed(4000, {
    pickNot: "P-007",
    blocked: { "P-007": "RESTRICTED_CATEGORY" },
  }),
  "EV-027": proposed(5000, {
    pickIn: ["P-009", "P-010"],
    blocked: { "P-011": "OVER_BUDGET" },
    stored: { "P-011": { price_cents: 19900 } },
  }),
  "EV-028": proposed(3000, { pickIn: ["P-020"], pickNot: "P-004" }),
  "EV-029": proposed(2000, {
    pickIn: ["P-019"],
    stored: { "P-019": { total_cents: 1400, title: "Phone Case" } },
  }),
  "EV-030": proposed(4000, {
    pickIn: ["P-002", "P-006"],
    blocked: { "P-001": "EXCLUDED_TERM" },
  }),
};
