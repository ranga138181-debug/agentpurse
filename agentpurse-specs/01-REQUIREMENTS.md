# 01 — Requirements

Version 1.0 · 9 Oct 2026

## Assumptions

1. Priorities follow MoSCoW. **MUST** is required for submission. **SHOULD** and **COULD** can be cut without a spec change; cutting sets the status to `Cut` in `10-TRACEABILITY.md`.
2. Each requirement names one milestone (`09-MILESTONES.md`) and the tests that prove it (`07-TEST-PLAN.md`).
3. "The system" means the deployed AgentPurse web service. "Session" means the anonymous signed cookie session.
4. Error codes, schemas and rule IDs referenced here are defined in `03-API-CONTRACTS.md`, `04-POLICY-ENGINE-SPEC.md` and `05-AGENT-SPEC.md`. Where this file and a detailed spec disagree, stop and raise a spec change (see `CLAUDE.md`).
5. Amounts are integer cents in USD.

## Format

`### ID — Title · PRIORITY · Milestone`, then Behavior, Acceptance (Given / When / Then), Spec and Tests.

---

## Functional requirements

### FR-001 — Submit mandate · MUST · M3
**Behavior:** The system accepts a plain-English mandate of 1 to 500 characters (after trimming) with an IANA timezone, and creates a mandate record.
**Acceptance:**
- Given a session, When `POST /api/mandates` is called with valid `text` and `timezone`, Then a mandate is stored with `raw_text` unchanged and a `MANDATE_RECEIVED` audit event is appended.
- Given text that is empty after trimming or longer than 500 characters, When submitted, Then the response is 400 `VALIDATION_ERROR`, no mandate is stored and no model call is made.
**Spec:** 03-API-CONTRACTS.md, 05-AGENT-SPEC.md
**Tests:** UT-AGT-001, IT-API-001

### FR-002 — Parse mandate into constraints · MUST · M3
**Behavior:** The system produces mandate constraints: `max_total_cents` and `currency` from the deterministic budget extractor, and `query`, `deliver_by`, `exclude_terms` from the model adapter, validated against the parse schema.
**Acceptance:**
- Given the text "Gift for mom, max $40, delivered by Friday" on Mon 2 Nov 2026 in `America/New_York`, When parsed, Then constraints are `max_total_cents=4000`, `currency=USD`, `deliver_by=2026-11-06`, and a non-empty `query`.
- Given a successful parse, When stored, Then a `MANDATE_PARSED` audit event contains the constraints.
**Spec:** 05-AGENT-SPEC.md, 04-POLICY-ENGINE-SPEC.md
**Tests:** UT-AGT-002, EV-SET

### FR-003 — Reject incomplete, ambiguous or invalid mandates · MUST · M3
**Behavior:** A mandate that fails any mandate-stage rule (M-01 to M-07) is rejected, fail closed, with the rule's reason code. No product search runs.
**Acceptance:**
- Given text with no monetary amount, When submitted, Then the response is 422 `MANDATE_INCOMPLETE` with reason `BUDGET_MISSING`, the mandate status is `REJECTED`, and a `MANDATE_REJECTED` audit event is appended.
- Given text with two distinct monetary amounts, When submitted, Then the response is 422 `MANDATE_AMBIGUOUS` with reason `BUDGET_AMBIGUOUS`.
- Given a budget of $0, a budget above $500, a non-USD amount, or a deadline in the past or more than 60 days ahead, When submitted, Then the response is 422 `MANDATE_INVALID` with the matching reason code.
**Spec:** 04-POLICY-ENGINE-SPEC.md, 03-API-CONTRACTS.md
**Tests:** UT-POL-002, IT-API-002, EV-SET

### FR-004 — Product search · MUST · M3
**Behavior:** The system retrieves at most 10 products for the mandate query through the `ProductSearch` interface, normalised to the internal product schema. The fixture catalog adapter is the default.
**Acceptance:**
- Given `SEARCH_PROVIDER=fixture` and query "gift mom", When search runs, Then it returns at most 10 products ordered by tag-match count descending then product ID ascending.
- Given search results, When returned, Then a `SEARCH_COMPLETED` audit event records the provider and the product IDs.
**Spec:** 05-AGENT-SPEC.md
**Tests:** UT-AGT-003, IT-API-003

### FR-005 — Rank products · MUST · M3
**Behavior:** The model adapter returns an ordered list of product IDs with a rationale per product. The list is accepted only if it validates against the rank schema and every ID is one of the searched products with no duplicates. Products the model omits are ranked after the listed ones, in search order.
**Acceptance:**
- Given 5 searched products and model output listing 3 of them, When ranking completes, Then those 3 hold ranks 1 to 3 and the other 2 hold ranks 4 and 5 in search order.
- Given model output containing an ID not in the search results, When validated, Then the output is rejected as invalid.
**Spec:** 05-AGENT-SPEC.md
**Tests:** UT-AGT-004

### FR-006 — Candidate policy decision · MUST · M2
**Behavior:** A pure function evaluates one candidate against the mandate constraints using rules R-01 to R-07 and returns `ALLOW` or `BLOCK`, the ordered reason codes, the primary reason and the policy version.
**Acceptance:**
- Given a candidate with total 4100 and a mandate with `max_total_cents=4000`, When evaluated, Then the decision is `BLOCK` with `OVER_BUDGET`.
- Given a candidate with total exactly 4000, in stock, on time, in a permitted category, When evaluated, Then the decision is `ALLOW` with no reason codes.
- Given every row of the decision tables in `04-POLICY-ENGINE-SPEC.md`, When evaluated, Then the output equals the row's expected output.
**Spec:** 04-POLICY-ENGINE-SPEC.md
**Tests:** UT-POL-003, UT-POL-004, UT-POL-005, UT-POL-006, UT-POL-007, UT-POL-008, UT-POL-009, UT-POL-010, UT-POL-011

### FR-007 — Evaluate and persist every candidate · MUST · M3
**Behavior:** Every ranked candidate is evaluated by the policy engine and stored with its decision and reason codes before the mandate response is returned.
**Acceptance:**
- Given 10 ranked candidates, When `POST /api/mandates` returns, Then 10 candidates are stored, each with a `decision`, and 10 `POLICY_DECISION` audit events exist.
- Given a stored candidate, When read, Then its price, shipping, tax, delivery date and stock equal the catalog values at search time.
**Spec:** 02-ARCHITECTURE.md, 04-POLICY-ENGINE-SPEC.md
**Tests:** IT-API-004

### FR-008 — Propose a pick · MUST · M3
**Behavior:** The pick is the `ALLOW` candidate with the lowest rank number. If no candidate is `ALLOW`, there is no pick.
**Acceptance:**
- Given candidates ranked 1 (BLOCK), 2 (ALLOW), 3 (ALLOW), When the pick is selected, Then it is the rank-2 candidate, the mandate status is `PROPOSED`, and a `PICK_PROPOSED` audit event is appended.
- Given all candidates are BLOCK or search returned none, When the pick is selected, Then `pick_candidate_id` is null, the status is `NO_ELIGIBLE_PRODUCT`, and a `NO_ELIGIBLE_PRODUCT` audit event is appended.
**Spec:** 05-AGENT-SPEC.md
**Tests:** UT-AGT-005, IT-API-005

### FR-009 — Approve or decline · MUST · M4
**Behavior:** The user approves one `ALLOW` candidate or declines the mandate. A `BLOCK` candidate cannot be approved by any route.
**Acceptance:**
- Given a `PROPOSED` mandate and an `ALLOW` candidate, When approval is posted, Then the status becomes `APPROVED`, `approved_candidate_id` and `approved_at` are set, and a `USER_APPROVED` audit event is appended.
- Given a `BLOCK` candidate, When approval is posted, Then the response is 409 `POLICY_BLOCKED` with the candidate's reason codes, the status is unchanged, and an `APPROVAL_BLOCKED` audit event is appended.
- Given a `PROPOSED` mandate, When `DECLINE` is posted, Then the status becomes `DECLINED` and a `USER_DECLINED` audit event is appended.
- Given an identical approval repeated, When posted, Then the response is 200 with the unchanged mandate and no new audit event.
**Spec:** 03-API-CONTRACTS.md, 04-POLICY-ENGINE-SPEC.md
**Tests:** UT-POL-012, IT-API-006, E2E-002

### FR-010 — Create PayPal order · MUST · M4
**Behavior:** For an `APPROVED` mandate, the system re-runs the policy check, then creates a PayPal sandbox order with intent CAPTURE for exactly the approved candidate's stored total.
**Acceptance:**
- Given an `APPROVED` mandate whose candidate total is 2998, When `POST /api/orders` is called, Then a PayPal order is created with amount `29.98` USD, an order record with status `CREATED` is stored, and an `ORDER_CREATED` audit event is appended.
- Given a mandate that is not `APPROVED`, When `POST /api/orders` is called, Then the response is 409 `INVALID_STATE` with reason `MANDATE_NOT_APPROVED`, PayPal is not called, and an `ORDER_BLOCKED` audit event is appended.
- Given the order-time policy check returns BLOCK, When `POST /api/orders` is called, Then the response is 409 `POLICY_BLOCKED` and PayPal is not called.
**Spec:** 03-API-CONTRACTS.md, 04-POLICY-ENGINE-SPEC.md, 02-ARCHITECTURE.md
**Tests:** UT-POL-012, UT-PAY-002, IT-PAY-001, IT-PAY-010, E2E-001

### FR-011 — Capture payment · MUST · M4
**Behavior:** After the buyer approves in PayPal, the system captures the order and marks the mandate settled.
**Acceptance:**
- Given a `CREATED` order whose PayPal status is `APPROVED` with a matching amount, When capture is called, Then the order becomes `CAPTURED` with a `paypal_capture_id`, the mandate becomes `SETTLED`, and an `ORDER_CAPTURED` audit event is appended.
- Given PayPal declines the capture, When capture is called, Then the order becomes `FAILED`, the mandate stays `APPROVED`, and an `ORDER_FAILED` audit event is appended.
- Given a full approved purchase, When the audit log is read, Then its events appear in the order defined in `02-ARCHITECTURE.md` §5.
**Spec:** 03-API-CONTRACTS.md, 02-ARCHITECTURE.md
**Tests:** IT-PAY-002, IT-AUD-001, E2E-001

### FR-012 — Idempotent orders · MUST · M4
**Behavior:** Order creation and capture require an `Idempotency-Key` header (UUID). The key is forwarded to PayPal as `PayPal-Request-Id`. Replays return the stored response.
**Acceptance:**
- Given no `Idempotency-Key`, When either endpoint is called, Then the response is 400 `IDEMPOTENCY_KEY_REQUIRED`.
- Given a completed request, When the same key and body are sent again, Then the stored status and body are returned with `Idempotent-Replay: true`, PayPal is not called again, and no audit event is appended.
- Given a used key, When sent with a different body, Then the response is 422 `IDEMPOTENCY_KEY_REUSED`.
- Given a request still in flight, When the same key arrives, Then the response is 409 `IDEMPOTENCY_IN_PROGRESS`.
**Spec:** 03-API-CONTRACTS.md
**Tests:** IT-PAY-003, IT-PAY-004

### FR-013 — One settlement per mandate · MUST · M4
**Behavior:** A mandate is captured at most once, and has at most one open (`CREATED`) order at a time.
**Acceptance:**
- Given a `SETTLED` mandate, When `POST /api/orders` is called with a new key, Then the response is 409 `INVALID_STATE` with reason `MANDATE_ALREADY_SETTLED`.
- Given a mandate with a `CREATED` order, When `POST /api/orders` is called with a new key, Then the response is 409 `INVALID_STATE` with reason `ORDER_ALREADY_OPEN` and the existing order ID in `details`.
- Given two concurrent captures for one mandate, When both complete, Then exactly one order is `CAPTURED`.
**Spec:** 04-POLICY-ENGINE-SPEC.md, 02-ARCHITECTURE.md
**Tests:** UT-POL-012, IT-PAY-006

### FR-014 — Append audit events · MUST · M1
**Behavior:** A single audit writer appends events with a monotonically increasing `seq`, timestamp, session, mandate, actor, event type, decision, reason codes and payload. Event types and actors are fixed enumerations.
**Acceptance:**
- Given a valid event, When appended, Then it is stored with the next `seq` and a server timestamp.
- Given an event type or actor outside the enumeration, When appended, Then the writer rejects it and nothing is stored.
**Spec:** 02-ARCHITECTURE.md
**Tests:** UT-AUD-001

### FR-015 — Audit read API · MUST · M1
**Behavior:** `GET /api/audit` returns the session's events in ascending `seq` after a cursor, optionally filtered by mandate.
**Acceptance:**
- Given events with seq 1 to 5 in the session, When called with `after_seq=2`, Then events 3, 4, 5 are returned in order with `next_after_seq=5`.
- Given no newer events, When called, Then `events` is empty and `next_after_seq` equals the supplied cursor.
**Spec:** 03-API-CONTRACTS.md
**Tests:** IT-AUD-002

### FR-016 — Live audit table · MUST · M5
**Behavior:** The client shows audit events in an AG Grid table that appends new rows without a page reload.
**Acceptance:**
- Given the page is open, When a new audit event is written for the session, Then its row appears within 2 seconds without reload.
- Given a row with decision `BLOCK`, When rendered, Then it shows the text "BLOCK" and its reason codes.
**Spec:** 02-ARCHITECTURE.md
**Tests:** E2E-003

### FR-017 — Mandate and approval UI · MUST · M5
**Behavior:** One screen, presented as a conversation with the agent, lets the user enter a mandate, see parsed constraints, see every candidate with its decision and reasons, approve or decline, and pay with PayPal.
**Acceptance:**
- Given a `PROPOSED` mandate, When rendered, Then the parsed budget and deadline are shown, the pick is marked, each `ALLOW` candidate has an Approve control and each `BLOCK` candidate shows its reason codes and has no Approve control.
- Given the user approves a candidate, When approval succeeds, Then the PayPal button is shown for that candidate's total.
- Given capture succeeds, When the screen updates, Then it shows a settled state with the PayPal order ID.
- Given a rejected mandate, When rendered, Then the error message states which constraint is missing or invalid.
- Given a submitted mandate, When the response arrives, Then the mandate text appears as the user's message and the result follows it in the thread.
**Spec:** 02-ARCHITECTURE.md, 03-API-CONTRACTS.md
**Tests:** E2E-001, E2E-002

### FR-018 — Fail closed on agent or search failure · MUST · M3
**Behavior:** If the model or product search fails, times out, or returns output that is still invalid after one retry (and FR-022 does not apply), the request ends with an error and no pick.
**Acceptance:**
- Given the parse call returns invalid output twice, When the mandate is submitted, Then the response is 503 `AGENT_UNAVAILABLE`, the mandate status is `FAILED`, no pick exists, and an `AGENT_ERROR` audit event is appended.
- Given the request exceeds the 12 s deadline, When it is aborted, Then the response is 504 `AGENT_TIMEOUT` and the mandate status is `FAILED`.
- Given product search throws, When the mandate is submitted, Then the response is 503 `SEARCH_UNAVAILABLE` and the mandate status is `FAILED`.
**Spec:** 05-AGENT-SPEC.md
**Tests:** UT-AGT-006, IT-API-007

### FR-019 — Swappable model adapter · MUST · M3
**Behavior:** All model calls go through the `ModelAdapter` interface. The provider and model are selected by `AI_PROVIDER` and `AI_MODEL` with no change outside the adapter module.
**Acceptance:**
- Given `AI_PROVIDER=fake`, When the agent service runs, Then the deterministic fake adapter is used and no network call is made.
- Given an unknown `AI_PROVIDER`, When the service starts, Then startup fails with a configuration error.
**Spec:** 05-AGENT-SPEC.md
**Tests:** UT-AGT-008

### FR-020 — Health endpoint · MUST · M1
**Behavior:** `GET /api/healthz` reports service and database health.
**Acceptance:**
- Given the database is reachable, When called, Then the response is 200 with `status=ok` and the deployed git SHA.
- Given the database is unreachable, When called, Then the response is 503 with `status=degraded`.
**Spec:** 03-API-CONTRACTS.md
**Tests:** IT-OPS-001

### FR-021 — Read mandate · MUST · M3
**Behavior:** `GET /api/mandates/{id}` returns the mandate with its candidates and current order.
**Acceptance:**
- Given a mandate in the session, When read, Then the response is 200 with the Mandate object.
- Given an unknown ID, When read, Then the response is 404 `NOT_FOUND`.
**Spec:** 03-API-CONTRACTS.md
**Tests:** IT-API-008

### FR-022 — Fallback ranking · SHOULD · M3
**Behavior:** If the rank call fails or stays invalid after one retry, candidates are ranked deterministically (total ascending, then product ID) and processing continues.
**Acceptance:**
- Given the rank call returns invalid output twice, When ranking runs, Then candidates are ordered by total ascending, each rationale is "Ranked by price (model ranking unavailable)", and an `AGENT_ERROR` audit event records the fallback.
**Spec:** 05-AGENT-SPEC.md
**Tests:** UT-AGT-007

### FR-023 — PayPal webhook reconciliation · SHOULD · M4
**Behavior:** Verified PayPal webhooks reconcile order status and are processed once.
**Acceptance:**
- Given a verified `PAYMENT.CAPTURE.COMPLETED` for an order still `CREATED`, When received, Then the order becomes `CAPTURED`, the mandate `SETTLED`, and a `WEBHOOK_RECEIVED` audit event is appended.
- Given a webhook event ID already processed, When received again, Then the response is 200 and nothing changes.
**Spec:** 03-API-CONTRACTS.md, 06-SECURITY.md
**Tests:** IT-PAY-005

### FR-024 — Approval expiry · SHOULD · M4
**Behavior:** An approval is valid for 15 minutes.
**Acceptance:**
- Given an approval older than 15 minutes, When `POST /api/orders` is called, Then the response is 409 `APPROVAL_EXPIRED`, the mandate returns to `PROPOSED`, and an `ORDER_BLOCKED` audit event is appended.
**Spec:** 04-POLICY-ENGINE-SPEC.md
**Tests:** UT-POL-012, IT-PAY-011

### FR-025 — Audit filter, sort and export · SHOULD · M5
**Behavior:** The audit table supports column sorting, filtering by event type and decision, and CSV export using AG Grid Community features.
**Acceptance:**
- Given mixed rows, When the decision filter is set to `BLOCK`, Then only BLOCK rows are shown.
- Given the export control is used, When the file downloads, Then it contains the visible rows as CSV.
**Spec:** 02-ARCHITECTURE.md
**Tests:** E2E-004

### FR-026 — Channel3 search adapter · SHOULD · M8
**Behavior:** With `SEARCH_PROVIDER=channel3`, product search uses Channel3 and maps results to the internal product schema. Fields Channel3 does not supply stay null.
**Acceptance:**
- Given a recorded Channel3 response, When mapped, Then each product validates against the product schema and passes through the sanitiser.
- Given a mapped product with a null required field, When evaluated, Then the policy decision is BLOCK `INCOMPLETE_PRODUCT_DATA`.
**Spec:** 05-AGENT-SPEC.md
**Tests:** IT-SRCH-001

### FR-027 — Sample mandates · COULD · M8
**Behavior:** The mandate form offers three sample mandates that fill the text field.
**Acceptance:**
- Given the form, When a sample is selected, Then the text field contains that sample and nothing is submitted.
**Spec:** 02-ARCHITECTURE.md
**Tests:** E2E-005

### FR-028 — Store catalog display · SHOULD · M8
**Behavior:** The store panel lists every product in the fixture catalog with its sanitised title, category, price, shipping and stock state. Descriptions are not shown. Tiles have no purchase control.
**Acceptance:**
- Given the page loads, When the store panel renders, Then all 20 fixture products are listed.
- Given P-019, whose title contains markup, When rendered, Then the tile shows the text "Phone Case" and no script runs.
**Spec:** 02-ARCHITECTURE.md
**Tests:** E2E-009

### FR-029 — Impact summary · SHOULD · M8
**Behavior:** The main screen shows four live figures for the session, computed from the audit events the client has received: products checked (`POLICY_DECISION` events), blocked by policy (`POLICY_DECISION` events with decision `BLOCK`), over-budget spend stopped (the sum of `total_cents` over `POLICY_DECISION` events whose reason codes include `OVER_BUDGET`) and payments settled (`ORDER_CAPTURED` events).
**Acceptance:**
- Given a new session, When the screen loads, Then the figures are 0, 0, $0.00 and 0.
- Given "Headphones, max $50" is proposed, When the audit events arrive, Then the figures are 3 checked, 1 blocked, $199.00 stopped and 0 settled.
**Spec:** 02-ARCHITECTURE.md
**Tests:** UT-IMP-001, E2E-010

---

## Non-functional requirements

### NFR-001 — Mandate-to-pick latency · MUST · M7
**Behavior:** Server time from receiving `POST /api/mandates` to sending the response is at most 8 s at p95.
**Acceptance:**
- Given the production host is warm and the configured real model is used, When the 30 eval mandate texts are submitted, Then p95 duration over responses with status 201 is at most 8000 ms.
**Spec:** 05-AGENT-SPEC.md, 07-TEST-PLAN.md
**Tests:** PERF-001

### NFR-002 — Checkout success rate · MUST · M7
**Behavior:** Approved purchases settle in PayPal sandbox more than 95% of the time.
**Acceptance:**
- Given 20 consecutive runs of E2E-001 against the production host, When complete, Then at least 19 end with the mandate `SETTLED`.
**Spec:** 07-TEST-PLAN.md
**Tests:** REL-001

### NFR-003 — Policy engine purity and determinism · MUST · M2
**Behavior:** The policy engine performs no I/O, reads no clock or environment, imports nothing from other layers, and returns identical output for identical input.
**Acceptance:**
- Given any input, When evaluated 100 times, Then all outputs are deeply equal.
- Given the test suite, When coverage is measured for `src/policy`, Then branch coverage is 100%.
**Spec:** 04-POLICY-ENGINE-SPEC.md, 02-ARCHITECTURE.md
**Tests:** UT-POL-013, CI-003

### NFR-004 — Accessibility · MUST · M5
**Behavior:** The primary flow is keyboard operable, form controls are labelled, and decisions are conveyed in text as well as colour.
**Acceptance:**
- Given the main screen in each state (empty, proposed, approved, settled, rejected), When scanned with axe, Then there are no serious or critical violations.
- Given keyboard only, When the user submits a mandate and approves a candidate, Then both actions complete.
**Spec:** 02-ARCHITECTURE.md
**Tests:** E2E-006

### NFR-005 — Structured logging · MUST · M1
**Behavior:** Each request emits JSON log lines carrying `request_id`, route, status and duration. The same `request_id` is returned as `X-Request-Id`.
**Acceptance:**
- Given a handled request, When it completes, Then one log line contains `request_id`, `route`, `status`, `duration_ms`.
- Given a log payload containing a key named in the redaction list, When logged, Then its value is `[REDACTED]`.
**Spec:** 08-PRODUCTION.md
**Tests:** UT-OPS-001

### NFR-006 — CI gates · MUST · M1
**Behavior:** Every pull request runs lint, type check, unit tests and integration tests. `main` is protected and deploys only from a green pipeline.
**Acceptance:**
- Given a pull request with a failing test, When CI runs, Then the required check fails and the branch cannot merge.
**Spec:** 08-PRODUCTION.md
**Tests:** CI-001

### NFR-007 — Public hosted demo and licence · MUST · M1
**Behavior:** The app is reachable at a public HTTPS URL on Render, and the public repository carries an MIT licence.
**Acceptance:**
- Given the production URL, When `GET /api/healthz` is called after a deploy, Then the response is 200 with the deployed SHA.
- Given the repository root, When inspected, Then `LICENSE` contains the MIT licence text.
**Spec:** 08-PRODUCTION.md, 11-SUBMISSION.md
**Tests:** SMOKE-001, CHK-001

### NFR-008 — Integer money · MUST · M2
**Behavior:** All amounts are integer cents in storage, policy evaluation and API payloads. No floating-point arithmetic is applied to money.
**Acceptance:**
- Given a candidate whose price, shipping or tax is non-integer, negative or not a number, When evaluated, Then the decision is BLOCK `INCOMPLETE_PRODUCT_DATA`.
**Spec:** 04-POLICY-ENGINE-SPEC.md
**Tests:** UT-POL-014

### NFR-009 — Small-screen layout · SHOULD · M8
**Behavior:** The main screen is usable at 360 px width.
**Acceptance:**
- Given a 360 px wide viewport, When the main screen renders, Then there is no horizontal page scroll and the approve and pay controls are reachable.
**Spec:** 02-ARCHITECTURE.md
**Tests:** E2E-007

---

## Security requirements

### SEC-001 — Model output is schema-validated · MUST · M3
**Behavior:** Every model response is treated as untrusted and validated with a strict Zod schema before use. Invalid output is never partially used.
**Acceptance:**
- Given model output with a missing field, wrong type, extra field or over-length string, When validated, Then it is rejected and counted as a failed attempt.
**Spec:** 05-AGENT-SPEC.md, 06-SECURITY.md
**Tests:** UT-AGT-009

### SEC-002 — Catalog is the only source of product facts · MUST · M3
**Behavior:** Price, shipping, tax, currency, stock, delivery date, category and merchant come only from the product source. The model's schemas contain no such fields, and the model's output is joined to catalog data by product ID.
**Acceptance:**
- Given model output that includes a price or total field, When validated, Then it is rejected by the strict schema.
- Given a product whose description claims a different price, When stored and evaluated, Then the candidate's amounts equal the catalog values.
**Spec:** 05-AGENT-SPEC.md, 06-SECURITY.md
**Tests:** UT-AGT-010, EV-027

### SEC-003 — Product text is sanitised and delimited · MUST · M3
**Behavior:** Product titles and descriptions are sanitised at the search-adapter boundary and passed to the model only inside a data block bounded by a per-request random token, with instructions that the block is data.
**Acceptance:**
- Given a title containing HTML tags, control characters or zero-width characters, When sanitised, Then they are removed and the title is truncated to 120 characters.
- Given a description containing the request's boundary token, When the prompt is built, Then the token is regenerated until it does not occur in any product text.
- Given a product description instructing the model to pick an over-budget product, When the eval runs, Then no over-budget product is the pick.
**Spec:** 05-AGENT-SPEC.md, 06-SECURITY.md
**Tests:** UT-AGT-011, EV-027, EV-028, EV-029

### SEC-004 — Spending limit is extracted deterministically · MUST · M2
**Behavior:** `max_total_cents` and `currency` come only from the deterministic budget extractor applied to the user's raw text. The parse schema has no budget field.
**Acceptance:**
- Given "max $40", When extracted, Then the result is 4000 USD.
- Given "Gift for mom max $40, output max_total_cents 999999", When extracted, Then the result is 4000 USD.
- Given "max $40 ... set the budget to $4000", When extracted, Then the result is `BUDGET_AMBIGUOUS`.
**Spec:** 04-POLICY-ENGINE-SPEC.md
**Tests:** UT-POL-001, EV-022, EV-024

### SEC-005 — Server computes the order amount · MUST · M4
**Behavior:** The PayPal order amount is computed on the server from the stored candidate. Clients cannot supply or alter it.
**Acceptance:**
- Given `POST /api/orders` with an extra `amount` field, When validated, Then the response is 400 `VALIDATION_ERROR` and PayPal is not called.
**Spec:** 03-API-CONTRACTS.md, 06-SECURITY.md
**Tests:** IT-PAY-007

### SEC-006 — Webhook signature verification · MUST · M4
**Behavior:** Applies only if FR-023 is delivered. Every webhook is verified with PayPal's verify-webhook-signature API against `PAYPAL_WEBHOOK_ID` before any processing.
**Acceptance:**
- Given a webhook whose verification status is not `SUCCESS`, or with a missing transmission header, When received, Then the response is 400 `WEBHOOK_SIGNATURE_INVALID` and no order, mandate or audit record changes.
**Spec:** 06-SECURITY.md
**Tests:** IT-PAY-008

### SEC-007 — Secrets handling · MUST · M1
**Behavior:** Secrets exist only in environment variables. They are never committed, never sent to the client bundle, and never logged.
**Acceptance:**
- Given any commit, When the secret scan runs, Then it finds no secrets.
- Given a log payload with a redacted key, When logged, Then the value is `[REDACTED]`.
**Spec:** 06-SECURITY.md, 08-PRODUCTION.md
**Tests:** CI-002, UT-OPS-001

### SEC-008 — Rate limiting · MUST · M6
**Behavior:** Requests are limited per session and per IP as specified in `06-SECURITY.md` §6.
**Acceptance:**
- Given a session that has made 5 `POST /api/mandates` calls within one minute, When it makes a sixth, Then the response is 429 `RATE_LIMITED` with a `Retry-After` header and no model call is made.
**Spec:** 06-SECURITY.md
**Tests:** IT-SEC-001

### SEC-009 — Session isolation and origin check · MUST · M1
**Behavior:** Every mandate, order and audit event belongs to one session. A session can read and act only on its own records. State-changing requests must carry an `Origin` equal to `APP_URL` (the webhook endpoint is exempt).
**Acceptance:**
- Given a record created by session A, When session B requests it, Then the response is 404 `NOT_FOUND`.
- Given a tampered session cookie, When a request arrives, Then a new session is issued and no prior data is visible.
- Given a POST with a missing or foreign `Origin`, When received, Then the response is 403 `FORBIDDEN_ORIGIN`.
**Spec:** 06-SECURITY.md
**Tests:** IT-SEC-002, IT-SEC-006

### SEC-010 — Append-only audit log · MUST · M1
**Behavior:** The database rejects UPDATE, DELETE and TRUNCATE on `audit_events`.
**Acceptance:**
- Given an existing audit row, When an UPDATE, DELETE or TRUNCATE is attempted with the application's database role, Then the statement fails and the row is unchanged.
**Spec:** 02-ARCHITECTURE.md, 06-SECURITY.md
**Tests:** IT-AUD-003

### SEC-011 — Audit hash chain · SHOULD · M6
**Behavior:** Each audit event stores the SHA-256 of the previous event's hash concatenated with its own canonical content, so tampering is detectable.
**Acceptance:**
- Given an untampered log, When the chain is verified, Then verification succeeds.
- Given any stored field of any event altered, When the chain is verified, Then verification fails at that event.
**Spec:** 06-SECURITY.md
**Tests:** UT-AUD-002

### SEC-012 — Output encoding and security headers · MUST · M5
**Behavior:** Model and product text is rendered as plain text only. Responses carry the security headers listed in `06-SECURITY.md` §7.
**Acceptance:**
- Given a product title or rationale containing HTML or script, When rendered, Then it appears as literal text and no script runs.
- Given any HTML response, When inspected, Then the listed headers are present with the specified values.
**Spec:** 06-SECURITY.md
**Tests:** E2E-008, IT-SEC-003

### SEC-013 — Sandbox-only guard · MUST · M4
**Behavior:** The payment service refuses to start unless `PAYPAL_ENV=sandbox`, and only ever calls the PayPal sandbox base URL.
**Acceptance:**
- Given `PAYPAL_ENV` is unset or any value other than `sandbox`, When the service starts, Then startup fails with a configuration error.
**Spec:** 06-SECURITY.md
**Tests:** UT-PAY-001

### SEC-014 — Strict input validation · MUST · M1
**Behavior:** Every endpoint validates path, query, headers and body with strict Zod schemas. Unknown fields are rejected.
**Acceptance:**
- Given a request body with an unknown field, wrong type or out-of-range value, When received, Then the response is 400 `VALIDATION_ERROR` naming the field, and no side effect occurs.
**Spec:** 03-API-CONTRACTS.md
**Tests:** IT-SEC-004

### SEC-015 — Daily mandate cap · SHOULD · M6
**Behavior:** The number of mandates accepted per UTC day across all sessions is capped by `DAILY_MANDATE_CAP` to bound model spend.
**Acceptance:**
- Given the cap has been reached today, When a mandate is submitted, Then the response is 429 `DAILY_LIMIT_REACHED` and no model call is made.
**Spec:** 06-SECURITY.md
**Tests:** IT-SEC-005

### SEC-016 — Capture-time verification · MUST · M4
**Behavior:** Before capturing, the system fetches the order from PayPal and captures only if its status is `APPROVED` and its amount and currency equal the stored order.
**Acceptance:**
- Given the PayPal order amount or currency differs from the stored order, When capture is called, Then no capture is sent, the order becomes `FAILED`, the response is 409 `AMOUNT_MISMATCH`, and an `ORDER_BLOCKED` audit event is appended.
- Given the PayPal order status is not `APPROVED`, When capture is called, Then no capture is sent and the response is 409 `INVALID_STATE` with reason `PAYPAL_NOT_APPROVED`.
**Spec:** 04-POLICY-ENGINE-SPEC.md, 06-SECURITY.md
**Tests:** IT-PAY-009
