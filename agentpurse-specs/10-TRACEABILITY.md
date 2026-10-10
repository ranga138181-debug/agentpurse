# 10 — Traceability Matrix

Version 1.0 · 9 Oct 2026

## Assumptions

1. `01-REQUIREMENTS.md` is the source for ID, title, priority, spec, tests and milestone. This matrix mirrors it. If they differ, `01-REQUIREMENTS.md` wins and the difference is fixed by spec change.
2. The **Spec** column lists the detailed spec files; every requirement is also defined in `01-REQUIREMENTS.md`.
3. Status values: `Not started`, `In progress`, `Done` (unit and integration tests pass), `Verified` (all listed tests pass), `Cut` (SHOULD or COULD only).
4. Status is updated after each requirement, in the same commit as the work (`CLAUDE.md`).

## Matrix

| Requirement | Title | Priority | Spec | Tests | Milestone | Status |
|---|---|---|---|---|---|---|
| FR-001 | Submit mandate | MUST | 03-API-CONTRACTS.md, 05-AGENT-SPEC.md | UT-AGT-001, IT-API-001 | M3 | Done |
| FR-002 | Parse mandate into constraints | MUST | 05-AGENT-SPEC.md, 04-POLICY-ENGINE-SPEC.md | UT-AGT-002, EV-SET | M3 | Done |
| FR-003 | Reject incomplete, ambiguous or invalid mandates | MUST | 04-POLICY-ENGINE-SPEC.md, 03-API-CONTRACTS.md | UT-POL-002, IT-API-002, EV-SET | M3 | Done |
| FR-004 | Product search | MUST | 05-AGENT-SPEC.md | UT-AGT-003, IT-API-003 | M3 | Done |
| FR-005 | Rank products | MUST | 05-AGENT-SPEC.md | UT-AGT-004 | M3 | Done |
| FR-006 | Candidate policy decision | MUST | 04-POLICY-ENGINE-SPEC.md | UT-POL-003, UT-POL-004, UT-POL-005, UT-POL-006, UT-POL-007, UT-POL-008, UT-POL-009, UT-POL-010, UT-POL-011 | M2 | Done |
| FR-007 | Evaluate and persist every candidate | MUST | 02-ARCHITECTURE.md, 04-POLICY-ENGINE-SPEC.md | IT-API-004 | M3 | Done |
| FR-008 | Propose a pick | MUST | 05-AGENT-SPEC.md | UT-AGT-005, IT-API-005 | M3 | Done |
| FR-009 | Approve or decline | MUST | 03-API-CONTRACTS.md, 04-POLICY-ENGINE-SPEC.md | UT-POL-012, IT-API-006, E2E-002 | M4 | Not started |
| FR-010 | Create PayPal order | MUST | 03-API-CONTRACTS.md, 04-POLICY-ENGINE-SPEC.md, 02-ARCHITECTURE.md | UT-POL-012, UT-PAY-002, IT-PAY-001, IT-PAY-010, E2E-001 | M4 | Not started |
| FR-011 | Capture payment | MUST | 03-API-CONTRACTS.md, 02-ARCHITECTURE.md | IT-PAY-002, IT-AUD-001, E2E-001 | M4 | Not started |
| FR-012 | Idempotent orders | MUST | 03-API-CONTRACTS.md | IT-PAY-003, IT-PAY-004 | M4 | Not started |
| FR-013 | One settlement per mandate | MUST | 04-POLICY-ENGINE-SPEC.md, 02-ARCHITECTURE.md | UT-POL-012, IT-PAY-006 | M4 | Not started |
| FR-014 | Append audit events | MUST | 02-ARCHITECTURE.md | UT-AUD-001 | M1 | Done |
| FR-015 | Audit read API | MUST | 03-API-CONTRACTS.md | IT-AUD-002 | M1 | Done |
| FR-016 | Live audit table | MUST | 02-ARCHITECTURE.md | E2E-003 | M5 | Not started |
| FR-017 | Mandate and approval UI | MUST | 02-ARCHITECTURE.md, 03-API-CONTRACTS.md | E2E-001, E2E-002 | M5 | Not started |
| FR-018 | Fail closed on agent or search failure | MUST | 05-AGENT-SPEC.md | UT-AGT-006, IT-API-007 | M3 | Done |
| FR-019 | Swappable model adapter | MUST | 05-AGENT-SPEC.md | UT-AGT-008 | M3 | Done |
| FR-020 | Health endpoint | MUST | 03-API-CONTRACTS.md | IT-OPS-001 | M1 | Done |
| FR-021 | Read mandate | MUST | 03-API-CONTRACTS.md | IT-API-008 | M3 | Done |
| FR-022 | Fallback ranking | SHOULD | 05-AGENT-SPEC.md | UT-AGT-007 | M3 | Done |
| FR-023 | PayPal webhook reconciliation | SHOULD | 03-API-CONTRACTS.md, 06-SECURITY.md | IT-PAY-005 | M4 | Not started |
| FR-024 | Approval expiry | SHOULD | 04-POLICY-ENGINE-SPEC.md | UT-POL-012, IT-PAY-011 | M4 | Not started |
| FR-025 | Audit filter, sort and export | SHOULD | 02-ARCHITECTURE.md | E2E-004 | M5 | Not started |
| FR-026 | Channel3 search adapter | SHOULD | 05-AGENT-SPEC.md | IT-SRCH-001 | M8 | Not started |
| FR-027 | Sample mandates | COULD | 02-ARCHITECTURE.md | E2E-005 | M8 | Not started |
| NFR-001 | Mandate-to-pick latency | MUST | 05-AGENT-SPEC.md, 07-TEST-PLAN.md | PERF-001 | M7 | Not started |
| NFR-002 | Checkout success rate | MUST | 07-TEST-PLAN.md | REL-001 | M7 | Not started |
| NFR-003 | Policy engine purity and determinism | MUST | 04-POLICY-ENGINE-SPEC.md, 02-ARCHITECTURE.md | UT-POL-013, CI-003 | M2 | Done |
| NFR-004 | Accessibility | MUST | 02-ARCHITECTURE.md | E2E-006 | M5 | Not started |
| NFR-005 | Structured logging | MUST | 08-PRODUCTION.md | UT-OPS-001 | M1 | Done |
| NFR-006 | CI gates | MUST | 08-PRODUCTION.md | CI-001 | M1 | Verified |
| NFR-007 | Public hosted demo and licence | MUST | 08-PRODUCTION.md, 11-SUBMISSION.md | SMOKE-001, CHK-001 | M1 | Done |
| NFR-008 | Integer money | MUST | 04-POLICY-ENGINE-SPEC.md | UT-POL-014 | M2 | Done |
| NFR-009 | Small-screen layout | SHOULD | 02-ARCHITECTURE.md | E2E-007 | M8 | Not started |
| SEC-001 | Model output is schema-validated | MUST | 05-AGENT-SPEC.md, 06-SECURITY.md | UT-AGT-009 | M3 | Done |
| SEC-002 | Catalog is the only source of product facts | MUST | 05-AGENT-SPEC.md, 06-SECURITY.md | UT-AGT-010, EV-027 | M3 | Done |
| SEC-003 | Product text is sanitised and delimited | MUST | 05-AGENT-SPEC.md, 06-SECURITY.md | UT-AGT-011, EV-027, EV-028, EV-029 | M3 | Done |
| SEC-004 | Spending limit is extracted deterministically | MUST | 04-POLICY-ENGINE-SPEC.md | UT-POL-001, EV-022, EV-024 | M2 | Done |
| SEC-005 | Server computes the order amount | MUST | 03-API-CONTRACTS.md, 06-SECURITY.md | IT-PAY-007 | M4 | Not started |
| SEC-006 | Webhook signature verification | MUST | 06-SECURITY.md | IT-PAY-008 | M4 | Not started |
| SEC-007 | Secrets handling | MUST | 06-SECURITY.md, 08-PRODUCTION.md | CI-002, UT-OPS-001 | M1 | Done |
| SEC-008 | Rate limiting | MUST | 06-SECURITY.md | IT-SEC-001 | M6 | Not started |
| SEC-009 | Session isolation and origin check | MUST | 06-SECURITY.md | IT-SEC-002, IT-SEC-006 | M1 | Done |
| SEC-010 | Append-only audit log | MUST | 02-ARCHITECTURE.md, 06-SECURITY.md | IT-AUD-003 | M1 | Done |
| SEC-011 | Audit hash chain | SHOULD | 06-SECURITY.md | UT-AUD-002 | M6 | Not started |
| SEC-012 | Output encoding and security headers | MUST | 06-SECURITY.md | E2E-008, IT-SEC-003 | M5 | Not started |
| SEC-013 | Sandbox-only guard | MUST | 06-SECURITY.md | UT-PAY-001 | M4 | Not started |
| SEC-014 | Strict input validation | MUST | 03-API-CONTRACTS.md | IT-SEC-004 | M1 | Done |
| SEC-015 | Daily mandate cap | SHOULD | 06-SECURITY.md | IT-SEC-005 | M6 | Not started |
| SEC-016 | Capture-time verification | MUST | 04-POLICY-ENGINE-SPEC.md, 06-SECURITY.md | IT-PAY-009 | M4 | Not started |

## Summary

| Type | MUST | SHOULD | COULD | Total |
|---|---|---|---|---|
| FR | 21 | 5 | 1 | 27 |
| NFR | 8 | 1 | 0 | 9 |
| SEC | 14 | 2 | 0 | 16 |
| **All** | 43 | 8 | 1 | 52 |

## By milestone

| Milestone | Requirements |
|---|---|
| M1 | FR-014, FR-015, FR-020, NFR-005, NFR-006, NFR-007, SEC-007, SEC-009, SEC-010, SEC-014 |
| M2 | FR-006, NFR-003, NFR-008, SEC-004 |
| M3 | FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-008, FR-018, FR-019, FR-021, FR-022, SEC-001, SEC-002, SEC-003 |
| M4 | FR-009, FR-010, FR-011, FR-012, FR-013, FR-023, FR-024, SEC-005, SEC-006, SEC-013, SEC-016 |
| M5 | FR-016, FR-017, FR-025, NFR-004, SEC-012 |
| M6 | SEC-008, SEC-011, SEC-015 |
| M7 | NFR-001, NFR-002 |
| M8 | FR-026, FR-027, NFR-009 |

## Test to requirement index

| Test | Requirements |
|---|---|
| CHK-001 | NFR-007 |
| CI-001 | NFR-006 |
| CI-002 | SEC-007 |
| CI-003 | NFR-003 |
| E2E-001 | FR-010, FR-011, FR-017 |
| E2E-002 | FR-009, FR-017 |
| E2E-003 | FR-016 |
| E2E-004 | FR-025 |
| E2E-005 | FR-027 |
| E2E-006 | NFR-004 |
| E2E-007 | NFR-009 |
| E2E-008 | SEC-012 |
| EV-022 | SEC-004 |
| EV-024 | SEC-004 |
| EV-027 | SEC-002, SEC-003 |
| EV-028 | SEC-003 |
| EV-029 | SEC-003 |
| EV-SET | FR-002, FR-003 |
| IT-API-001 | FR-001 |
| IT-API-002 | FR-003 |
| IT-API-003 | FR-004 |
| IT-API-004 | FR-007 |
| IT-API-005 | FR-008 |
| IT-API-006 | FR-009 |
| IT-API-007 | FR-018 |
| IT-API-008 | FR-021 |
| IT-AUD-001 | FR-011 |
| IT-AUD-002 | FR-015 |
| IT-AUD-003 | SEC-010 |
| IT-OPS-001 | FR-020 |
| IT-PAY-001 | FR-010 |
| IT-PAY-002 | FR-011 |
| IT-PAY-003 | FR-012 |
| IT-PAY-004 | FR-012 |
| IT-PAY-005 | FR-023 |
| IT-PAY-006 | FR-013 |
| IT-PAY-007 | SEC-005 |
| IT-PAY-008 | SEC-006 |
| IT-PAY-009 | SEC-016 |
| IT-PAY-010 | FR-010 |
| IT-PAY-011 | FR-024 |
| IT-SEC-001 | SEC-008 |
| IT-SEC-002 | SEC-009 |
| IT-SEC-003 | SEC-012 |
| IT-SEC-004 | SEC-014 |
| IT-SEC-005 | SEC-015 |
| IT-SEC-006 | SEC-009 |
| IT-SRCH-001 | FR-026 |
| PERF-001 | NFR-001 |
| REL-001 | NFR-002 |
| SMOKE-001 | NFR-007 |
| UT-AGT-001 | FR-001 |
| UT-AGT-002 | FR-002 |
| UT-AGT-003 | FR-004 |
| UT-AGT-004 | FR-005 |
| UT-AGT-005 | FR-008 |
| UT-AGT-006 | FR-018 |
| UT-AGT-007 | FR-022 |
| UT-AGT-008 | FR-019 |
| UT-AGT-009 | SEC-001 |
| UT-AGT-010 | SEC-002 |
| UT-AGT-011 | SEC-003 |
| UT-AUD-001 | FR-014 |
| UT-AUD-002 | SEC-011 |
| UT-OPS-001 | NFR-005, SEC-007 |
| UT-PAY-001 | SEC-013 |
| UT-PAY-002 | FR-010 |
| UT-POL-001 | SEC-004 |
| UT-POL-002 | FR-003 |
| UT-POL-003 | FR-006 |
| UT-POL-004 | FR-006 |
| UT-POL-005 | FR-006 |
| UT-POL-006 | FR-006 |
| UT-POL-007 | FR-006 |
| UT-POL-008 | FR-006 |
| UT-POL-009 | FR-006 |
| UT-POL-010 | FR-006 |
| UT-POL-011 | FR-006 |
| UT-POL-012 | FR-009, FR-010, FR-013, FR-024 |
| UT-POL-013 | NFR-003 |
| UT-POL-014 | NFR-008 |
