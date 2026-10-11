# 09 — Milestones

Version 1.0 · 9 Oct 2026

## Assumptions

1. One developer working with an AI coding agent, every day from Fri 9 Oct to Thu 12 Nov 2026 (35 days).
2. Hard deadline: Fri 13 Nov 2026 01:30 IST. Internal submission target: Thu 12 Nov 20:00 IST, leaving 5.5 hours of margin.
3. A requirement is `Done` at its milestone when its unit and integration tests pass. It becomes `Verified` when its e2e, eval and other listed tests also pass (M5 for UI flows, M7 for everything).
4. If a milestone slips, SHOULD and COULD requirements are cut in this order before any MUST is touched: FR-027, NFR-009, FR-026, FR-025, SEC-011, SEC-015, FR-024, FR-023 (with SEC-006), FR-022.
5. Work proceeds one requirement at a time in the order listed for each day (`CLAUDE.md`).
6. SEC-007 starts on 12 Oct (secret scan, git-ignore rules, `.env.example`) and stays `In progress` until its unit test UT-OPS-001 passes with the logger delivered by NFR-005 on 13 Oct.
7. NFR-008 follows FR-006 because its test UT-POL-014 exercises `evaluateCandidate`.
8. The policy half of FR-003 (`validateBudget`, `validateDeadline`, UT-POL-002) is built in M2 so that every DT-M row passes there. FR-003 remains an M3 requirement and stays `In progress` until IT-API-002 passes.
9. In M3 each requirement's logic and unit tests are built on its scheduled day. `POST /api/mandates` is assembled on 24 Oct with FR-007 and FR-008, and the API tests IT-API-001 to IT-API-005 are added then. A requirement whose API test is pending stays `In progress` until that day.
10. M4 follows the same convention. Order: FR-009; SEC-013; the Stage O and Stage C policy functions with UT-POL-012; FR-010 with SEC-005; FR-024; FR-012; SEC-016 with FR-011; FR-013; SEC-006 with FR-023. Each requirement's API test is added once its endpoint exists, and the requirement stays `In progress` until then.

## Standard definition of done (every milestone)

- Every listed requirement has tests written from its acceptance criteria, and they pass.
- Lint and type check are clean.
- `10-TRACEABILITY.md` status is updated for each requirement.
- Each requirement is committed separately, with its ID in the commit message.
- CI is green on `main`.

Each milestone adds its own criteria below.

## Milestone summary

| # | Name | Dates | Requirements |
|---|---|---|---|
| M0 | Specs and accounts | 9–11 Oct | none |
| M1 | Foundation | 12–14 Oct | FR-014, FR-015, FR-020, NFR-005, NFR-006, NFR-007, SEC-007, SEC-009, SEC-010, SEC-014 |
| M2 | Policy engine | 15–19 Oct | FR-006, NFR-003, NFR-008, SEC-004 |
| M3 | Agent service | 20–25 Oct | FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-008, FR-018, FR-019, FR-021, FR-022, SEC-001, SEC-002, SEC-003 |
| M4 | Approval and payments | 26–30 Oct | FR-009, FR-010, FR-011, FR-012, FR-013, FR-023, FR-024, SEC-005, SEC-006, SEC-013, SEC-016 |
| M5 | Client | 31 Oct–3 Nov | FR-016, FR-017, FR-025, NFR-004, SEC-012 |
| M6 | Hardening | 4–5 Nov | SEC-008, SEC-011, SEC-015 |
| M7 | Verification | 6–8 Nov | NFR-001, NFR-002 |
| M8 | Stretch and polish | 9–10 Nov | FR-026, FR-027, FR-028, NFR-009; client redesign (rework of FR-017) |
| M9 | Submission | 11–12 Nov | none |

## Day by day

| Date | Day | M | Work | Requirements |
|---|---|---|---|---|
| 9 Oct | Fri | M0 | Spec package written and reviewed | – |
| 10 Oct | Sat | M0 | Create PayPal developer account, sandbox app, business and buyer accounts; AI provider key; Render account; register on Devpost | – |
| 11 Oct | Sun | M0 | Read official rules and sponsor prize terms; confirm PayPal, Render and Channel3 documentation against spec assumptions; raise spec changes; spec freeze | – |
| 12 Oct | Mon | M1 | Public repo with MIT licence; Next.js scaffold; lint, type check, test runner; CI workflow; secret scan; branch protection | NFR-006, SEC-007 |
| 13 Oct | Tue | M1 | Logger; database schema and migrations; audit writer; append-only trigger; session cookie and origin check | NFR-005, FR-014, SEC-010, SEC-009 |
| 14 Oct | Wed | M1 | Strict validation and error envelope; audit read API; health endpoint; Render blueprint and first deploy | SEC-014, FR-015, FR-020, NFR-007 |
| 15 Oct | Thu | M2 | Budget extractor | SEC-004 |
| 16 Oct | Fri | M2 | Candidate rules R-01 to R-04 | FR-006 |
| 17 Oct | Sat | M2 | Candidate rules R-05 to R-07; precedence and reason lists | FR-006 |
| 18 Oct | Sun | M2 | Decision-table tests for every DT-R, DT-L, DT-B row; integer-money test; mandate rules M-01 to M-07 with every DT-M row | FR-006, NFR-008, FR-003 (policy functions and UT-POL-002 only) |
| 19 Oct | Mon | M2 | Purity and determinism tests; 100% branch coverage gate | NFR-003 |
| 20 Oct | Tue | M3 | Model adapter interface, fake adapter, provider adapter; output schemas | FR-019, SEC-001 |
| 21 Oct | Wed | M3 | Mandate submission; mandate rules and rejection; parsing | FR-001, FR-003, FR-002 |
| 22 Oct | Thu | M3 | Fixture catalog and search; sanitiser and data-block boundaries | FR-004, SEC-003 |
| 23 Oct | Fri | M3 | Ranking and post-processing; catalog join; fallback ranking | FR-005, SEC-002, FR-022 |
| 24 Oct | Sat | M3 | Evaluate and persist candidates; pick selection; read mandate | FR-007, FR-008, FR-021 |
| 25 Oct | Sun | M3 | Timeouts, retries, deadline, fail-closed paths; milestone buffer | FR-018 |
| 26 Oct | Mon | M4 | Approval endpoint and Stage A rules; approval expiry | FR-009, FR-024 |
| 27 Oct | Tue | M4 | PayPal client and sandbox guard; Stage O rules; order creation | SEC-013, FR-010, SEC-005 |
| 28 Oct | Wed | M4 | Idempotency store and behaviour for create and capture | FR-012 |
| 29 Oct | Thu | M4 | Stage C rules; capture; single-settlement constraints | SEC-016, FR-011, FR-013 |
| 30 Oct | Fri | M4 | Webhook endpoint, verification, reconciliation; sandbox contract test | SEC-006, FR-023 |
| 31 Oct | Sat | M5 | Mandate form, constraints display, candidate cards, error states | FR-017 |
| 1 Nov | Sun | M5 | Approve and decline; PayPal buttons; settled state; E2E-001 and E2E-002 | FR-017 |
| 2 Nov | Mon | M5 | AG Grid audit table with polling; filter, sort, CSV export | FR-016, FR-025 |
| 3 Nov | Tue | M5 | Accessibility pass; plain-text rendering; security headers | NFR-004, SEC-012 |
| 4 Nov | Wed | M6 | Rate limiting; daily cap | SEC-008, SEC-015 |
| 5 Nov | Thu | M6 | Audit hash chain; security review checklist | SEC-011 |
| 6 Nov | Fri | M7 | Eval harness; first full eval run; latency measurement on production (PERF-001) | NFR-001 |
| 7 Nov | Sat | M7 | Full e2e suite on production; 20-run reliability check | NFR-002 |
| 8 Nov | Sun | M7 | Fix failures; rerun gates; **feature freeze for MUST scope** | – |
| 9 Nov | Mon | M8 | Channel3 adapter (cut by 18:00 IST if not passing) | FR-026 |
| 10 Nov | Tue | M8 | Sample mandates; small-screen layout; **stretch freeze** | FR-027, NFR-009 |
| 11 Nov | Wed | M9 | Re-read official rules; final release gates; tag `v1.0.0`; README; record demo video | – |
| 12 Nov | Thu | M9 | Upload video; complete Devpost form; **production freeze 12:00 IST; submit by 20:00 IST** | – |

## Milestone definitions of done

### M0 — Specs and accounts (9–11 Oct)
- All 13 spec files reviewed; contradictions resolved.
- PayPal sandbox app credentials, one sandbox buyer account, AI provider key and Render account exist.
- Every "to be confirmed" assumption about PayPal, Render and Channel3 is either confirmed or raised as a spec change.

### M1 — Foundation (12–14 Oct)
- Standard definition of done.
- Production URL serves `/api/healthz` with the deployed SHA (SMOKE-001).
- CI-001 verified once with a deliberately failing pull request.
- `LICENSE` is MIT; `.env.example` lists every variable.

### M2 — Policy engine (15–19 Oct)
- Standard definition of done.
- Every DT-M, DT-R, DT-L and DT-B row is a passing test.
- `src/policy` has 100% branch coverage and imports nothing outside itself.

### M3 — Agent service (20–25 Oct)
- Standard definition of done.
- `POST /api/mandates` works end to end with the `fake` adapter and with the real provider on production.
- A manual run of EV-001, EV-014, EV-022 and EV-027 against the real model gives the expected outcomes.

### M4 — Approval and payments (26–30 Oct)
- Standard definition of done.
- Every DT-A, DT-O and DT-C row is a passing test.
- IT-PAY-010 passes against the real sandbox.
- A full purchase can be completed through the API using a sandbox buyer approval.

### M5 — Client (31 Oct–3 Nov)
- Standard definition of done.
- E2E-001, E2E-002, E2E-003, E2E-006 and E2E-008 pass (E2E-004 if FR-025 is delivered).
- Requirements whose only outstanding tests were these e2e tests move to `Verified`.

### M6 — Hardening (4–5 Nov)
- Standard definition of done.
- Security review checklist (`06-SECURITY.md` §10) complete.

### M7 — Verification (6–8 Nov)
- Eval gates met (`07-TEST-PLAN.md` §6.3).
- PERF-001 and REL-001 met.
- Every MUST requirement is `Verified`.
- No open defect against a MUST requirement.

### M8 — Stretch and polish (9–10 Nov)
- Each listed requirement is either `Verified` or `Cut` with its code removed.
- All release gates still pass after the last change.

### M9 — Submission (11–12 Nov)
- All release gates G1 to G11 met on the tagged commit.
- CHK-001 complete (`11-SUBMISSION.md`).
- Devpost submission confirmed by 12 Nov 20:00 IST.
