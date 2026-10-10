# 06 — Security

Version 1.0 · 9 Oct 2026

## Assumptions

1. Sandbox only. The assets at risk are: correctness of the spending limit, integrity of the audit log, PayPal sandbox and AI provider credentials, and AI spend on a public demo.
2. Visitors are anonymous. Any visitor may be hostile. Product text and model output are hostile by default.
3. One application instance behind Render's TLS termination. The client IP is taken from the platform's forwarded-for header.
4. PayPal webhook verification uses PayPal's verify-webhook-signature API. Header names and response fields are to be confirmed against current PayPal documentation at integration.

## 1. Trust boundaries

| Source | Trust | Treatment |
|---|---|---|
| User mandate text | Untrusted input from the principal | Length-limited; budget extracted by code; remainder parsed by the model inside a data block |
| Model output | Untrusted | Strict schema validation; no facts accepted; never decides |
| Product source (fixture, Channel3) | Untrusted text, trusted-as-given numbers | Text sanitised; numbers validated by rule R-01 |
| Browser | Untrusted | Sends IDs and decisions only; never amounts |
| PayPal API responses | Trusted over TLS | Amount and status re-checked before capture |
| PayPal webhooks | Untrusted until verified | Signature verification, then de-duplication |
| Policy engine | Trusted | Pure, fully covered by tests |

## 2. Threat model

| ID | Threat | STRIDE | Mitigation | Requirement |
|---|---|---|---|---|
| T-01 | Product text instructs the model to pick an over-budget item | Tampering | Policy engine evaluates every candidate from catalog facts; injected text cannot change them | FR-006, SEC-002, SEC-003 |
| T-02 | Product text or mandate text persuades the model to raise the budget | Elevation | Budget never passes through the model | SEC-004 |
| T-03 | Model hallucinates a product, price or total | Tampering | Strict schema with no fact fields; IDs must be in the searched set | SEC-001, SEC-002, FR-005 |
| T-04 | User edits the request to approve a blocked candidate | Elevation | Approval rule A-03; order rule O-04 | FR-009, FR-010 |
| T-05 | Client alters the amount sent to PayPal | Tampering | Amount computed server-side; extra fields rejected | SEC-005, SEC-014 |
| T-06 | Buyer-side change to the PayPal order before capture | Tampering | Amount and currency compared with the stored order before capture | SEC-016 |
| T-07 | Double charge from retry, double click or race | Tampering | Idempotency keys, `PayPal-Request-Id`, unique indexes | FR-012, FR-013 |
| T-08 | Forged webhook marks an order captured | Spoofing | Signature verification; de-duplication | SEC-006, FR-023 |
| T-09 | One visitor reads or acts on another's mandate | Information disclosure | Session scoping; 404 for foreign records | SEC-009 |
| T-10 | Cross-site request triggers approval or order | Spoofing | `SameSite=Lax` cookie; `Origin` check; JSON-only bodies | SEC-009 |
| T-11 | Script in product text or rationale runs in the browser | Tampering | Sanitiser; plain-text rendering; CSP | SEC-003, SEC-012 |
| T-12 | Audit log edited to hide a decision | Repudiation | Database trigger blocks UPDATE, DELETE, TRUNCATE; optional hash chain | SEC-010, SEC-011 |
| T-13 | Secrets leak through repo, logs or client bundle | Information disclosure | Environment only; secret scan; log redaction; only `NEXT_PUBLIC_PAYPAL_CLIENT_ID` reaches the client | SEC-007 |
| T-14 | Demo abused to burn AI credits or spam PayPal | Denial of service | Rate limits; daily cap; 500-character limit; budget rules run before any model call | SEC-008, SEC-015 |
| T-15 | Live PayPal credentials configured by mistake | Elevation | Startup guard; sandbox base URL only | SEC-013 |
| T-16 | Model outage produces an unreviewed purchase | Tampering | Fail closed; human approval always required | FR-018, FR-009 |
| T-17 | Malformed input reaches business logic | Tampering | Strict Zod validation on every endpoint | SEC-014 |
| T-18 | Stale approval used long after review | Elevation | 15-minute approval expiry | FR-024 |

## 3. Out of scope

Account takeover (no accounts), real-money fraud, PCI scope (card data is handled only by PayPal's hosted flow), volumetric DDoS (left to the platform), and a compromised hosting provider.

## 4. Secrets (SEC-007)

- Secrets are the variables marked secret in `02-ARCHITECTURE.md` §9. They live in Render environment settings and GitHub Actions secrets only.
- `.env*` files are git-ignored. `.env.example` lists variable names with empty values.
- Only variables prefixed `NEXT_PUBLIC_` may be referenced from client code. The PayPal client ID is public by design.
- The logger redacts values of these keys at any depth: `authorization`, `cookie`, `set-cookie`, `client_secret`, `access_token`, `api_key`, `password`, `secret`, and any key ending `_secret` or `_key`.
- A secret scan runs on every push and pull request (CI-002) and fails the pipeline on a finding.
- PayPal OAuth access tokens are held in memory only and refreshed before expiry.
- If a secret is exposed: rotate it at the provider, update Render and GitHub, redeploy, and note the rotation in the repository's changelog.

## 5. Webhook verification (SEC-006)

Applies if FR-023 is delivered.

1. Read the raw request body before any parsing.
2. Require the five transmission headers (`03-API-CONTRACTS.md` §4.7). Any missing → 400 `WEBHOOK_SIGNATURE_INVALID`.
3. Call PayPal `POST /v1/notifications/verify-webhook-signature` with the header values, `webhook_id` = `PAYPAL_WEBHOOK_ID`, and the event body.
4. Proceed only if `verification_status` is `SUCCESS`. Otherwise 400 `WEBHOOK_SIGNATURE_INVALID`, a warning log, and no state change.
5. If the verification call fails (network or 5xx), return 502 so PayPal retries. Never treat an unverifiable event as valid.
6. Insert the event ID into `webhook_events`. If it already exists, return 200 and stop.
7. Match the event to an order by PayPal order ID. Apply the transition in `02-ARCHITECTURE.md` §4.7 only if the order is `CREATED`. Unmatched events are acknowledged and logged.
8. A webhook can move an order to `CAPTURED` only if the event's amount and currency equal the stored order; otherwise it is logged and ignored.

## 6. Rate limiting (SEC-008, SEC-015)

In-memory fixed one-minute windows. On breach: 429 `RATE_LIMITED` with `Retry-After` in seconds. The limit check runs before validation, model calls and database writes.

| Scope | Limit |
|---|---|
| `POST /api/mandates` per session | 5 per minute |
| `POST /api/mandates` per IP | 20 per minute |
| Other POST endpoints per session | 30 per minute |
| `GET` endpoints per session | 120 per minute |
| `/api/webhooks/paypal`, `/api/healthz` | not limited |

**Daily cap (SEC-015):** before any model call, count mandates created since 00:00 UTC. If the count is at or above `DAILY_MANDATE_CAP`, return 429 `DAILY_LIMIT_REACHED`.

Limits reset on restart. This is accepted for a single-instance demo.

## 7. Session, origin and headers

**Session (SEC-009)**

- Cookie `ap_session`: session UUID plus an HMAC-SHA-256 signature using `SESSION_SECRET`.
- Attributes: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, max age 7 days.
- A missing or invalid cookie results in a new session. Nothing from another session is ever returned.
- Every query for mandates, orders and audit events filters by session ID. A foreign or unknown ID returns 404, never 403, so existence is not revealed.

**Origin check (SEC-009):** every POST except the webhook requires `Origin` equal to `APP_URL`, else 403 `FORBIDDEN_ORIGIN`.

**Security headers (SEC-012)** on every HTML response:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'`; `script-src 'self' 'nonce-<per-request>'` and the PayPal origins; `style-src 'self' 'unsafe-inline'` and the PayPal origins; `frame-src` the PayPal origins; `connect-src 'self'` and the PayPal origins; `img-src 'self' data:` and the PayPal origins; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `DENY` |

The PayPal origins are `https://*.paypal.com` and `https://*.paypalobjects.com`, from PayPal's CSP guidance for its JavaScript SDK. `https://*.venmo.com` is omitted because only the PayPal button is offered. Inline styles are allowed because AG Grid and the PayPal button inject them; inline scripts remain nonce-only. In development only, `script-src` also carries `'unsafe-eval'`, which React's dev tooling needs.

**Output encoding (SEC-012):** product and model text is rendered through the framework's default text escaping. No API that injects raw HTML is used anywhere. AG Grid cells use default text rendering, not HTML cell renderers. URLs from product sources are rendered as links only if they are `https:`.

## 8. Audit integrity

- **Append-only (SEC-010):** a trigger on `audit_events` raises an exception for UPDATE, DELETE and TRUNCATE. Only the audit writer inserts.
- **Hash chain (SEC-011, optional):** `hash = SHA-256(prev_hash + canonical_json(seq, id, ts, session_id, mandate_id, actor, event_type, decision, reason_codes, payload))`. The first event uses 64 zeros as `prev_hash`. Inserts are serialised with a transaction-scoped advisory lock so `seq` order and chain order match. A verification function recomputes the chain and reports the first mismatching `seq`.
- Audit payloads never contain secrets, cookies or raw model output.

## 9. Payment safety summary

| Control | Where |
|---|---|
| Sandbox-only startup guard | SEC-013 |
| Amount from the stored candidate only | SEC-005 |
| Policy re-check at order time | FR-010 (rule O-04) |
| Idempotency on create and capture | FR-012 |
| One open order, one capture per mandate | FR-013 |
| Amount and status check before capture | SEC-016 |
| Verified, de-duplicated webhooks | SEC-006, FR-023 |

## 10. Security review checklist (run at M6)

- [ ] Every SEC requirement marked MUST is `Done` in `10-TRACEABILITY.md`.
- [ ] Secret scan clean on the full history.
- [ ] Client bundle searched for each secret variable name; none present.
- [ ] Each endpoint exercised with an unknown field, a foreign session and a missing `Origin`.
- [ ] All six product-injection and mandate-injection eval cases pass their safety invariants.
- [ ] Response headers checked on the production URL.
- [ ] `PAYPAL_ENV` confirmed `sandbox` in Render.
