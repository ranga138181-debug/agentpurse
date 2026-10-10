# 03 — API Contracts

Version 1.0 · 9 Oct 2026

## Assumptions

1. All endpoints live under `/api`, speak JSON (`Content-Type: application/json`), and are served by the Next.js app.
2. The session cookie `ap_session` is issued automatically on first request. There is no login and no 401.
3. Schemas below are the contract. Implementation expresses them as strict Zod schemas: unknown fields are rejected (SEC-014).
4. Amounts are integer cents. Dates are `YYYY-MM-DD`. Timestamps are ISO 8601 UTC.
5. PayPal request shapes follow Orders v2 and are to be confirmed against current PayPal documentation at integration.

## 1. Conventions

**Response headers (all):** `X-Request-Id: <uuid>`.

**Error envelope (all non-2xx):**

```json
{ "error": { "code": "POLICY_BLOCKED", "message": "Human-readable summary", "request_id": "uuid", "details": {} } }
```

`details` is optional and code-specific. Messages never include secrets, stack traces or raw model output.

**State-changing requests** (every POST except the webhook) require `Origin` equal to `APP_URL`, else 403 `FORBIDDEN_ORIGIN`.

## 2. Error codes

| HTTP | code | Meaning | details |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Request failed schema validation | `fields[]` |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Header missing or not a UUID | – |
| 400 | `WEBHOOK_SIGNATURE_INVALID` | Webhook failed verification | – |
| 403 | `FORBIDDEN_ORIGIN` | Missing or foreign Origin | – |
| 404 | `NOT_FOUND` | Unknown ID, or record belongs to another session | – |
| 409 | `INVALID_STATE` | Action not allowed in current state | `reason`, optional `order_id` |
| 409 | `POLICY_BLOCKED` | Policy engine returned BLOCK | `reason_codes[]` |
| 409 | `APPROVAL_EXPIRED` | Approval older than 15 min (FR-024) | – |
| 409 | `AMOUNT_MISMATCH` | PayPal order differs from stored order | – |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | Same key still being processed | – |
| 422 | `MANDATE_INCOMPLETE` | Budget missing | `reason_codes[]`, `mandate_id` |
| 422 | `MANDATE_AMBIGUOUS` | More than one distinct amount | `reason_codes[]`, `mandate_id` |
| 422 | `MANDATE_INVALID` | Other mandate-stage rule failed | `reason_codes[]`, `mandate_id` |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Key reused with a different body | – |
| 429 | `RATE_LIMITED` | Rate limit exceeded; `Retry-After` set | – |
| 429 | `DAILY_LIMIT_REACHED` | Daily mandate cap reached (SEC-015) | – |
| 502 | `PAYMENT_PROVIDER_ERROR` | PayPal error or timeout | – |
| 503 | `AGENT_UNAVAILABLE` | Model failed or stayed invalid | `mandate_id` |
| 503 | `SEARCH_UNAVAILABLE` | Product source failed | `mandate_id` |
| 504 | `AGENT_TIMEOUT` | 12 s request deadline exceeded | `mandate_id` |
| 500 | `INTERNAL` | Unhandled error | – |

`INVALID_STATE.reason` values: `MANDATE_NOT_PROPOSED`, `MANDATE_NOT_APPROVED`, `MANDATE_ALREADY_SETTLED`, `ORDER_ALREADY_OPEN`, `ORDER_NOT_CREATED`, `PAYPAL_NOT_APPROVED`.

## 3. Shared objects

### Constraints
| Field | Type | Notes |
|---|---|---|
| query | string 1..80 | |
| max_total_cents | integer 1..50000 | |
| currency | `"USD"` | |
| deliver_by | date or null | |
| exclude_terms | string[] (0..5, each 1..30) | |

### Candidate
| Field | Type |
|---|---|
| id | uuid |
| product_id | string |
| title, merchant, category | string or null |
| image_url, product_url | string or null |
| price_cents, shipping_cents, tax_cents, total_cents | integer or null |
| currency | string or null |
| estimated_delivery_date | date or null |
| in_stock | boolean or null |
| rank | integer ≥ 1 |
| rationale | string ≤ 280 or null |
| decision | `"ALLOW"` or `"BLOCK"` |
| reason_codes | string[] |
| policy_version | string |

### Order
| Field | Type |
|---|---|
| id | uuid |
| mandate_id, candidate_id | uuid |
| paypal_order_id | string |
| paypal_capture_id | string or null |
| amount_cents | integer |
| currency | `"USD"` |
| status | `"CREATED"`, `"CAPTURED"` or `"FAILED"` |
| created_at | timestamp |

### Mandate
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| status | `REJECTED`, `FAILED`, `PROPOSED`, `NO_ELIGIBLE_PRODUCT`, `APPROVED`, `DECLINED`, `SETTLED` | |
| raw_text | string | |
| constraints | Constraints or null | null when rejected before parsing |
| reject_reasons | string[] | |
| pick_candidate_id | uuid or null | |
| approved_candidate_id | uuid or null | |
| approved_at | timestamp or null | |
| candidates | Candidate[] | rank order |
| order | Order or null | most recent order |
| created_at | timestamp | |

### AuditEvent
| Field | Type |
|---|---|
| seq | integer |
| id | uuid |
| ts | timestamp |
| mandate_id | uuid or null |
| actor | `USER`, `AGENT`, `POLICY`, `PAYMENT`, `SYSTEM` |
| event_type | string (see `02-ARCHITECTURE.md` §5) |
| decision | `ALLOW`, `BLOCK` or null |
| reason_codes | string[] |
| payload | object |

`payload` carries, where relevant: `product_id`, `title`, `total_cents`, `rank`, `order_id`, `paypal_order_id`, `constraints`, `provider`, `error_code`.

## 4. Endpoints

### 4.1 `POST /api/mandates` — FR-001, FR-002, FR-003, FR-007, FR-008, FR-018

Creates a mandate, parses it, searches, ranks and evaluates. Synchronous, 12 s deadline.

**Request**
| Field | Type | Rules |
|---|---|---|
| text | string | 1..500 after trim |
| timezone | string | valid IANA zone |

**201** → Mandate with status `PROPOSED` or `NO_ELIGIBLE_PRODUCT`.

**Errors:** 400 `VALIDATION_ERROR`; 403; 422 `MANDATE_INCOMPLETE` / `MANDATE_AMBIGUOUS` / `MANDATE_INVALID`; 429 `RATE_LIMITED` / `DAILY_LIMIT_REACHED`; 503 `AGENT_UNAVAILABLE` / `SEARCH_UNAVAILABLE`; 504 `AGENT_TIMEOUT`.

**Idempotency:** not idempotent. Each accepted call creates a new mandate. A 400 creates nothing. A 422, 503 or 504 leaves a mandate with status `REJECTED` or `FAILED` whose ID is in `details.mandate_id`.

### 4.2 `GET /api/mandates/{id}` — FR-021

**200** → Mandate. **Errors:** 400 (ID not a UUID); 404.

### 4.3 `POST /api/mandates/{id}/approval` — FR-009

**Request**
| Field | Type | Rules |
|---|---|---|
| decision | `"APPROVE"` or `"DECLINE"` | |
| candidate_id | uuid | required for `APPROVE`; must be absent for `DECLINE` |

**200** → Mandate with status `APPROVED` or `DECLINED`.

**Errors:** 400; 403; 404 (mandate, or candidate not in this mandate); 409 `INVALID_STATE` (`MANDATE_NOT_PROPOSED`); 409 `POLICY_BLOCKED`.

**Idempotency:** naturally idempotent. Repeating the decision already recorded (same decision and same candidate) returns 200 with the current mandate and appends no audit event. Any different decision on a non-`PROPOSED` mandate returns 409 `INVALID_STATE`.

### 4.4 `POST /api/orders` — FR-010, FR-012, FR-013, FR-024, SEC-005

**Headers:** `Idempotency-Key: <uuid v4>` (required).

**Request**
| Field | Type |
|---|---|
| mandate_id | uuid |

No other field is accepted. The amount comes from the approved candidate.

**Server behaviour, in order:** validate; idempotency check; load mandate; `evaluateOrder`; create the PayPal order with `PayPal-Request-Id` equal to the idempotency key; store the order; append `ORDER_CREATED`.

**PayPal request:** `POST /v2/checkout/orders` with `intent: "CAPTURE"` and one purchase unit: `reference_id` = mandate ID, `custom_id` = order ID, `amount.currency_code` = `USD`, `amount.value` = total as a two-decimal string, `amount.breakdown` with `item_total`, `shipping`, `tax_total`.

**201** → Order with status `CREATED`.

**Errors:** 400 `IDEMPOTENCY_KEY_REQUIRED` / `VALIDATION_ERROR`; 403; 404; 409 `INVALID_STATE` (`MANDATE_NOT_APPROVED`, `MANDATE_ALREADY_SETTLED`, `ORDER_ALREADY_OPEN`); 409 `APPROVAL_EXPIRED`; 409 `POLICY_BLOCKED`; 409 `IDEMPOTENCY_IN_PROGRESS`; 422 `IDEMPOTENCY_KEY_REUSED`; 502 `PAYMENT_PROVIDER_ERROR`.

### 4.5 `POST /api/orders/{id}/capture` — FR-011, FR-012, FR-013, SEC-016

**Headers:** `Idempotency-Key: <uuid v4>` (required, different from the creation key).

**Request:** `{}` (empty object; no fields accepted).

**Server behaviour, in order:** validate; idempotency check; load order; fetch the PayPal order; `evaluateCapture`; capture with `PayPal-Request-Id` equal to the idempotency key; update order and mandate in one transaction; append `ORDER_CAPTURED`.

**200** → Order with status `CAPTURED`.

**Errors:** 400; 403; 404; 409 `INVALID_STATE` (`ORDER_NOT_CREATED`, `PAYPAL_NOT_APPROVED`, `MANDATE_ALREADY_SETTLED`); 409 `AMOUNT_MISMATCH` (order becomes `FAILED`); 409 `IDEMPOTENCY_IN_PROGRESS`; 422 `IDEMPOTENCY_KEY_REUSED`; 502 `PAYMENT_PROVIDER_ERROR` (order stays `CREATED` on provider 5xx or timeout; becomes `FAILED` if PayPal declines the capture).

### 4.6 `GET /api/audit` — FR-015

**Query**
| Param | Type | Default | Rules |
|---|---|---|---|
| after_seq | integer | 0 | ≥ 0 |
| limit | integer | 200 | 1..500 |
| mandate_id | uuid | – | optional filter |

**200**

```json
{ "events": [ /* AuditEvent, ascending seq */ ], "next_after_seq": 42 }
```

`next_after_seq` is the last returned `seq`, or the supplied `after_seq` when `events` is empty. Only the caller's session events are returned.

**Errors:** 400; 429.

### 4.7 `POST /api/webhooks/paypal` — FR-023, SEC-006

No session, no origin check, not rate limited by session.

**Headers required:** `paypal-transmission-id`, `paypal-transmission-time`, `paypal-transmission-sig`, `paypal-cert-url`, `paypal-auth-algo`.

**Body:** PayPal webhook event (raw body is preserved for verification).

**Handled event types:** `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`. Other verified types are acknowledged and ignored.

**200** → `{ "received": true }` for verified events, including duplicates and ignored types.

**Errors:** 400 `WEBHOOK_SIGNATURE_INVALID`; 502 `PAYMENT_PROVIDER_ERROR` if the verification call itself fails (PayPal will retry).

**Idempotency:** de-duplicated on PayPal event `id` in `webhook_events`. A duplicate changes nothing.

### 4.8 `GET /api/healthz` — FR-020

No session, not rate limited.

**200** → `{ "status": "ok", "db": "ok", "version": "<git sha>" }`
**503** → `{ "status": "degraded", "db": "down", "version": "<git sha>" }`

## 5. Idempotency behaviour (FR-012)

Scope: `(session, endpoint, key)`. Endpoint is `orders.create` or `orders.capture:{order_id}`.

| Situation | Result |
|---|---|
| Header missing or not a UUID | 400 `IDEMPOTENCY_KEY_REQUIRED` |
| New key | Record stored as `IN_PROGRESS`, request processed |
| Same key, same body hash, `COMPLETED` | Stored status and body returned, header `Idempotent-Replay: true`, no PayPal call, no audit event |
| Same key, different body hash | 422 `IDEMPOTENCY_KEY_REUSED` |
| Same key, `IN_PROGRESS` | 409 `IDEMPOTENCY_IN_PROGRESS` |
| Request ends 2xx or 4xx | Record set `COMPLETED` with the response stored |
| Request ends 5xx | Record deleted; the client may retry with the same key. `PayPal-Request-Id` makes the upstream retry safe |
| Record older than 24 h | Treated as a new key |

Validation errors raised before the idempotency check (400) are not stored.

## 6. Requirement to endpoint map

| Endpoint | Requirements |
|---|---|
| `POST /api/mandates` | FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-008, FR-018, FR-022, SEC-008, SEC-015 |
| `GET /api/mandates/{id}` | FR-021, SEC-009 |
| `POST /api/mandates/{id}/approval` | FR-009 |
| `POST /api/orders` | FR-010, FR-012, FR-013, FR-024, SEC-005 |
| `POST /api/orders/{id}/capture` | FR-011, FR-012, FR-013, SEC-016 |
| `GET /api/audit` | FR-015, SEC-009 |
| `POST /api/webhooks/paypal` | FR-023, SEC-006 |
| `GET /api/healthz` | FR-020 |
