# 00 — Product Requirements Document: AgentPurse

Version 1.0 · 9 Oct 2026 · Status: Approved for implementation

## Assumptions

1. Hackathon rules are as stated by the project owner (PayPal AI Hackathon on Devpost, deadline 13 Nov 2026 01:30 IST). The official rules page MUST be re-read on 11 Nov (see `11-SUBMISSION.md`); if it differs, the rules page wins.
2. One developer, working with an AI coding agent, builds the product from these specs.
3. PayPal is used in **sandbox only**. No real money moves and no goods ship. AgentPurse is the sandbox merchant of record; the catalog merchant is display data.
4. Currency is USD only. Budgets are inclusive caps on the **total** (item + shipping + tax). "Under $40", "max $40" and "$40" all mean total ≤ $40.00.
5. One unit of one product per mandate.
6. No user accounts. An anonymous signed session cookie scopes each visitor's data.
7. The default product source is a fixture catalog bundled with the app, so the demo is deterministic. Channel3 is an optional second source.

## 1. Problem

AI shopping agents can find products, but nobody will hand one a payment credential. A language model can be talked into overspending by a persuasive product page, can misread a constraint, or can simply hallucinate a price. Today the choice is "agent with full spending power" or "agent that only makes suggestions".

AgentPurse is the missing middle: a wallet whose spending limit is enforced by code the model cannot influence.

> **AI proposes. Policy engine decides. Human approves. PayPal settles.**

## 2. User

**Primary: the delegating shopper.** Someone who wants to hand off a small purchase ("gift for mom, max $40, delivered by Friday") and trusts an agent to search, but not to spend unchecked. They need to see why each product was accepted or rejected before paying.

**Secondary: the hackathon judge.** Has about three minutes. Needs to see a real PayPal sandbox settlement, an AI model doing real work, and a guardrail visibly stopping a bad purchase.

## 3. Product summary

1. The user types a plain-English mandate.
2. The spending limit is extracted **deterministically** from the text; the model never supplies it.
3. The model parses the remaining constraints and ranks products from the catalog.
4. The policy engine evaluates every candidate and returns ALLOW or BLOCK with reason codes.
5. The highest-ranked ALLOW candidate is proposed. The user approves or declines.
6. PayPal sandbox creates and captures the order for the exact approved total.
7. Every step is written to an append-only audit log shown live in an AG Grid table.

## 4. Success metrics

| ID | Metric | Target | Measured by |
|---|---|---|---|
| SM-1 | Over-budget or off-constraint purchase attempts blocked | 100% | Eval safety invariants (`07-TEST-PLAN.md` §6), UT-POL-011, E2E-002 |
| SM-2 | Mandate submitted to pick proposed | p95 under 8 s | PERF-001 (NFR-001) |
| SM-3 | Sandbox checkout success after user approval | over 95% (at least 19 of 20 consecutive runs) | REL-001 (NFR-002) |
| SM-4 | Decisions with an audit record | 100% | IT-AUD-001 |

## 5. Scope

**In scope (MUST):** mandate entry, deterministic budget extraction, model parsing and ranking behind a swappable adapter, policy engine, approval, PayPal sandbox order and capture with idempotency, append-only audit log, live audit table, hosted demo.

**Optional (SHOULD / COULD):** fallback ranking, PayPal webhook reconciliation, approval expiry, audit filtering and CSV export, audit hash chain, daily usage cap, Channel3 adapter, sample-mandate buttons, small-screen layout.

## 6. Non-goals

- Real payments, live PayPal credentials, fulfilment, refunds, disputes.
- User accounts, login, saved payment methods, vaulting.
- Multiple items, quantities above one, carts, subscriptions.
- Currencies other than USD; tax calculation (tax is a catalog field).
- Autonomous purchase without human approval.
- Agent tool use, browsing, or any model-initiated side effect.
- Merchant onboarding, marketplace payouts, multi-seller orders.
- Native mobile apps.
- Horizontal scaling. The service runs as one instance.

## 7. Judging criteria mapping

| Criterion | How AgentPurse addresses it |
|---|---|
| Technological implementation | Five-layer architecture, pure policy engine at 100% branch coverage, idempotent PayPal Orders integration, 30-mandate adversarial eval |
| Design | One-screen flow; each candidate shows its decision and reason; live audit table |
| Potential impact | A reusable pattern for giving any agent a bounded payment credential |
| Innovation | The spending limit never passes through the model; model output is treated as untrusted input |
| Presentation | Demo shows one approved purchase and one blocked over-budget attempt in under 3 minutes |

## 8. Sponsor prizes (optional)

| Sponsor | Use | Requirement | Priority |
|---|---|---|---|
| AG Grid | Audit table | FR-016, FR-025 | MUST / SHOULD |
| Render | Hosting and Postgres | NFR-007 | MUST |
| Channel3 | Live product search | FR-026 | SHOULD |

## 9. Risks

| Risk | Mitigation |
|---|---|
| Model latency breaks SM-2 | Per-call timeouts, temperature 0, at most 10 candidates, fallback ranking (FR-022) |
| PayPal sandbox instability breaks SM-3 | Idempotent retries, nightly sandbox contract test (IT-PAY-010) |
| Hosting cold start during judging | Instance kept warm; see `08-PRODUCTION.md` §2 |
| Scope creep | Everything below MUST is cut first; feature freeze 8 Nov |
