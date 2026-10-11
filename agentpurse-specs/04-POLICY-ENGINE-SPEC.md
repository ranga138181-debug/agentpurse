# 04 — Policy Engine Specification

Version 1.0 · Policy version `1.0.0` · 9 Oct 2026

## Assumptions

1. The policy engine is the only component that decides. The model's output never changes a decision.
2. It is a set of pure functions. All inputs, including `now` and `today`, are arguments (NFR-003).
3. Default is deny. A rule that cannot be evaluated blocks.
4. The single monetary amount in a mandate is the inclusive cap on the total. Budgets are USD, capped at $500.00 for the sandbox demo.
5. Dates are compared as calendar dates in the mandate's timezone. `today` is derived from `now` and the timezone by the caller.
6. Tables in §8 are the test oracle for UT-POL-011 and UT-POL-012.

## 1. Functions

| Function | Stage | Called by | Requirement |
|---|---|---|---|
| `extractBudget(text)` | M | `POST /api/mandates`, before any model call | SEC-004 |
| `validateBudget(extraction)` | M | same | FR-003 |
| `validateDeadline(deliver_by, today)` | M | same, after parse | FR-003 |
| `evaluateCandidate(constraints, candidate)` | R | `POST /api/mandates`; re-run by `evaluateOrder` | FR-006 |
| `evaluateApproval(mandate, candidate)` | A | approval endpoint | FR-009 |
| `evaluateOrder(mandate, candidate, orders, now)` | O | `POST /api/orders` | FR-010, FR-013, FR-024 |
| `evaluateCapture(order, paypalOrder, orders)` | C | capture endpoint | SEC-016, FR-013 |

## 2. Decision output

Every function returns the same shape:

| Field | Type | Notes |
|---|---|---|
| decision | `ALLOW` or `BLOCK` | |
| reason_codes | string[] | all failing evaluated rules, in precedence order; empty on ALLOW |
| primary_reason | string or null | first element of `reason_codes` |
| policy_version | string | `1.0.0` |
| total_cents | integer or null | `evaluateCandidate` only; null when data is incomplete |

`extractBudget` returns either `{ cents, currency }` or a reason code (`BUDGET_MISSING`, `BUDGET_AMBIGUOUS`).

## 3. Stage M: mandate rules

### 3.1 Budget extraction (SEC-004)

Applied to the raw text after Unicode NFKC normalisation, case-insensitive.

An **amount token** is either:

- a currency symbol (`$`, `US$`, `€`, `£`), optional space, then a number; or
- a number, optional space, then a currency word (`usd`, `dollar`, `dollars`, `bucks`, `eur`, `euro`, `euros`, `gbp`, `pound`, `pounds`).

A **number** is digits with optional thousands commas and an optional decimal part of one or two digits. Bare numbers ("6 year old", "999999") are not amounts. Amounts written as words ("forty dollars") are not amounts.

`$`, `US$`, `usd`, `dollar(s)`, `bucks` map to USD; the euro forms to EUR; the pound forms to GBP. Cents = number × 100, exact.

Distinct amounts are distinct `(currency, cents)` pairs. The same amount written twice counts once.

**Malformed and conflicting tokens.** The extractor never repairs a token and never chooses between candidates:

- A number must be complete. It is not an amount if it is immediately followed by another digit, or by `.` or `,` and a digit; in the number-then-word form it must also not be immediately preceded by a digit, `.` or `,`. So `$40.555` and `$1,2345` contain no amount token and give `BUDGET_MISSING`; they are never read as a smaller amount.
- A currency word must end at a non-letter. `40 dollarstore` is not an amount.
- The two token forms are matched independently over the whole text and their `(currency, cents)` pairs are pooled. `$40 USD` gives one pair (USD 4000). `€40 dollars` gives two pairs (EUR 4000 and USD 4000) and is `BUDGET_AMBIGUOUS`.

### 3.2 Rules

| Rule | Condition | Reason code | API error |
|---|---|---|---|
| M-01 | No amount token | `BUDGET_MISSING` | `MANDATE_INCOMPLETE` |
| M-02 | Two or more distinct amounts | `BUDGET_AMBIGUOUS` | `MANDATE_AMBIGUOUS` |
| M-03 | Currency is not USD | `UNSUPPORTED_CURRENCY` | `MANDATE_INVALID` |
| M-04 | Cents ≤ 0 | `BUDGET_NOT_POSITIVE` | `MANDATE_INVALID` |
| M-05 | Cents > 50000 | `BUDGET_EXCEEDS_CAP` | `MANDATE_INVALID` |
| M-06 | `deliver_by` < today | `DEADLINE_IN_PAST` | `MANDATE_INVALID` |
| M-07 | `deliver_by` > today + 60 days | `DEADLINE_TOO_FAR` | `MANDATE_INVALID` |

**Precedence:** M-01, M-02, M-03, M-04, M-05, M-06, M-07. Evaluation stops at the first failure (later rules depend on earlier ones). M-01 to M-05 run before the model is called. M-06 and M-07 run after parsing and are skipped when `deliver_by` is null.

## 4. Stage R: candidate rules (FR-006)

Inputs: `constraints` (`max_total_cents`, `currency`, `deliver_by`, `exclude_terms`) and one `candidate` (catalog snapshot).

`total_cents = price_cents + shipping_cents + tax_cents`.

| Rule | Condition that BLOCKS | Reason code |
|---|---|---|
| R-01 | Any of `product_id`, `title`, `merchant`, `category`, `currency`, `in_stock` is null or empty; or any of `price_cents`, `shipping_cents`, `tax_cents` is not a non-negative integer; or `deliver_by` is set and `estimated_delivery_date` is null | `INCOMPLETE_PRODUCT_DATA` |
| R-02 | `candidate.currency` ≠ `constraints.currency` | `CURRENCY_MISMATCH` |
| R-03 | `total_cents` > `max_total_cents` | `OVER_BUDGET` |
| R-04 | `in_stock` is false | `OUT_OF_STOCK` |
| R-05 | `deliver_by` is set and `estimated_delivery_date` > `deliver_by` | `LATE_DELIVERY` |
| R-06 | `category` is in the restricted list | `RESTRICTED_CATEGORY` |
| R-07 | Any exclude term is a substring of `title + " " + category` | `EXCLUDED_TERM` |

**Restricted list:** `alcohol`, `tobacco`, `weapons`, `adult`, `pharmacy`, `gift_card`.

**R-07 matching:** both sides NFKC-normalised and lower-cased; plain substring match.

**Boundaries:** total equal to the cap is allowed. Delivery on the deadline date is allowed.

### 4.1 Precedence

1. R-01 short-circuits. If it fails, it is the only reason and `total_cents` is null.
2. If R-02 fails, R-03 is skipped (amounts in different currencies cannot be compared).
3. R-03 to R-07 are otherwise all evaluated. `reason_codes` lists every failing rule in rule-number order.
4. The decision is ALLOW only if no rule fails.

## 5. Stage A: approval rules (FR-009)

| Rule | Condition that BLOCKS | Outcome |
|---|---|---|
| A-01 | Mandate status ≠ `PROPOSED` | 409 `INVALID_STATE` (`MANDATE_NOT_PROPOSED`) |
| A-02 | Candidate does not belong to the mandate | 404 `NOT_FOUND` |
| A-03 | Candidate decision ≠ `ALLOW` | 409 `POLICY_BLOCKED` with the candidate's reason codes |

Precedence: A-01, A-02, A-03; stop at first failure. A-01 does not apply to an identical repeat, which is handled as idempotent before the rules run (`03-API-CONTRACTS.md` §4.3). `DECLINE` evaluates A-01 only.

## 6. Stage O: order rules (FR-010, FR-013, FR-024)

Inputs: mandate, approved candidate, the mandate's existing orders, `now`.

| Rule | Condition that BLOCKS | Outcome |
|---|---|---|
| O-01 | An order for the mandate is `CAPTURED` | 409 `INVALID_STATE` (`MANDATE_ALREADY_SETTLED`) |
| O-02 | Mandate status ≠ `APPROVED` | 409 `INVALID_STATE` (`MANDATE_NOT_APPROVED`) |
| O-03 | `now − approved_at` > 15 minutes (only if FR-024 is delivered) | 409 `APPROVAL_EXPIRED`; mandate returns to `PROPOSED` |
| O-04 | `evaluateCandidate` on the stored snapshot returns BLOCK | 409 `POLICY_BLOCKED` with reason codes |
| O-05 | An order for the mandate is `CREATED` | 409 `INVALID_STATE` (`ORDER_ALREADY_OPEN`, with `order_id`) |

Precedence: O-01 to O-05; stop at first failure. On ALLOW the order amount is the candidate's `total_cents`.

Every Stage O block appends an `ORDER_BLOCKED` audit event.

## 7. Stage C: capture rules (SEC-016, FR-013)

Inputs: stored order, the order as fetched from PayPal, the mandate's orders.

| Rule | Condition that BLOCKS | Outcome |
|---|---|---|
| C-01 | Stored order status ≠ `CREATED` | 409 `INVALID_STATE` (`ORDER_NOT_CREATED`) |
| C-02 | Another order for the mandate is `CAPTURED` | 409 `INVALID_STATE` (`MANDATE_ALREADY_SETTLED`) |
| C-03 | PayPal amount (converted to cents) ≠ `amount_cents`, or PayPal currency ≠ order currency | 409 `AMOUNT_MISMATCH`; order becomes `FAILED` |
| C-04 | PayPal order status ≠ `APPROVED` | 409 `INVALID_STATE` (`PAYPAL_NOT_APPROVED`) |

Precedence: C-01 to C-04; stop at first failure. C-03 and C-04 blocks append an `ORDER_BLOCKED` audit event.

## 8. Decision tables

Legend: **Y** passes, **N** fails, **\*** any value, **–** not evaluated.

### 8.1 Stage M

| Row | Amount tokens | Currency | Cents | deliver_by vs today | Result |
|---|---|---|---|---|---|
| DT-M01 | none | – | – | – | `BUDGET_MISSING` |
| DT-M02 | ≥ 2 distinct | – | – | – | `BUDGET_AMBIGUOUS` |
| DT-M03 | 1 | not USD | * | – | `UNSUPPORTED_CURRENCY` |
| DT-M04 | 1 | USD | 0 | – | `BUDGET_NOT_POSITIVE` |
| DT-M05 | 1 | USD | 50001 | – | `BUDGET_EXCEEDS_CAP` |
| DT-M06 | 1 | USD | 50000 | null | valid |
| DT-M07 | 1 | USD | 1 | null | valid |
| DT-M08 | 1 | USD | 4000 | yesterday | `DEADLINE_IN_PAST` |
| DT-M09 | 1 | USD | 4000 | today | valid |
| DT-M10 | 1 | USD | 4000 | today + 60 d | valid |
| DT-M11 | 1 | USD | 4000 | today + 61 d | `DEADLINE_TOO_FAR` |
| DT-M12 | same amount twice | USD | 4000 | null | valid |

### 8.2 Stage R — decision and primary reason (exhaustive)

First matching row applies. Together the rows cover every combination of the seven conditions.

| Row | R-01 data complete | R-02 currency | R-03 within budget | R-04 in stock | R-05 on time or no deadline | R-06 category permitted | R-07 no excluded term | Decision | primary_reason |
|---|---|---|---|---|---|---|---|---|---|
| DT-R01 | N | – | – | – | – | – | – | BLOCK | `INCOMPLETE_PRODUCT_DATA` |
| DT-R02 | Y | N | – | * | * | * | * | BLOCK | `CURRENCY_MISMATCH` |
| DT-R03 | Y | Y | N | * | * | * | * | BLOCK | `OVER_BUDGET` |
| DT-R04 | Y | Y | Y | N | * | * | * | BLOCK | `OUT_OF_STOCK` |
| DT-R05 | Y | Y | Y | Y | N | * | * | BLOCK | `LATE_DELIVERY` |
| DT-R06 | Y | Y | Y | Y | Y | N | * | BLOCK | `RESTRICTED_CATEGORY` |
| DT-R07 | Y | Y | Y | Y | Y | Y | N | BLOCK | `EXCLUDED_TERM` |
| DT-R08 | Y | Y | Y | Y | Y | Y | Y | ALLOW | null |

### 8.3 Stage R — full reason list

For rows DT-R02 to DT-R07, `reason_codes` is every failing evaluated rule in rule order. UT-POL-010 enumerates all 64 combinations of R-02 to R-07 outcomes (32 with R-02 failing, where R-03 is skipped, and 32 with R-02 passing) and checks the list against this definition. Examples:

| Row | Failing rules | reason_codes |
|---|---|---|
| DT-L01 | R-03, R-05 | `OVER_BUDGET`, `LATE_DELIVERY` |
| DT-L02 | R-02, R-04, R-06 | `CURRENCY_MISMATCH`, `OUT_OF_STOCK`, `RESTRICTED_CATEGORY` |
| DT-L03 | R-03, R-04, R-05, R-06, R-07 | `OVER_BUDGET`, `OUT_OF_STOCK`, `LATE_DELIVERY`, `RESTRICTED_CATEGORY`, `EXCLUDED_TERM` |
| DT-L04 | R-01 and anything else | `INCOMPLETE_PRODUCT_DATA` |

### 8.4 Stage R — boundaries

Mandate: `max_total_cents=4000`, `deliver_by=2026-11-06`, no exclusions, unless stated.

| Row | Candidate | Decision | reason_codes |
|---|---|---|---|
| DT-B01 | total 4000 | ALLOW | – |
| DT-B02 | total 4001 | BLOCK | `OVER_BUDGET` |
| DT-B03 | price 3600, shipping 500 (total 4100) | BLOCK | `OVER_BUDGET` |
| DT-B04 | price 3999, tax 2 (total 4001) | BLOCK | `OVER_BUDGET` |
| DT-B05 | delivery 2026-11-06 | ALLOW | – |
| DT-B06 | delivery 2026-11-07 | BLOCK | `LATE_DELIVERY` |
| DT-B07 | `deliver_by` null, delivery null | ALLOW | – |
| DT-B08 | `deliver_by` set, delivery null | BLOCK | `INCOMPLETE_PRODUCT_DATA` |
| DT-B09 | price null | BLOCK | `INCOMPLETE_PRODUCT_DATA` |
| DT-B10 | price 29.99 (non-integer) | BLOCK | `INCOMPLETE_PRODUCT_DATA` |
| DT-B11 | shipping −1 | BLOCK | `INCOMPLETE_PRODUCT_DATA` |
| DT-B12 | total 0 (free item) | ALLOW | – |
| DT-B13 | category `gift_card` | BLOCK | `RESTRICTED_CATEGORY` |
| DT-B14 | exclude `leather`, title "Leather Wallet" | BLOCK | `EXCLUDED_TERM` |
| DT-B15 | exclude `leather`, title "Vegan Cork Wallet" | ALLOW | – |
| DT-B16 | exclude `candle`, title "Scented CANDLE Gift Set" | BLOCK | `EXCLUDED_TERM` |
| DT-B17 | currency EUR, total 3000 | BLOCK | `CURRENCY_MISMATCH` |

### 8.5 Stage A

| Row | Mandate status | Candidate in mandate | Candidate decision | Result |
|---|---|---|---|---|
| DT-A01 | not `PROPOSED` | * | * | `INVALID_STATE` |
| DT-A02 | `PROPOSED` | N | * | `NOT_FOUND` |
| DT-A03 | `PROPOSED` | Y | BLOCK | `POLICY_BLOCKED` |
| DT-A04 | `PROPOSED` | Y | ALLOW | ALLOW |

### 8.6 Stage O

| Row | Captured order exists | Mandate `APPROVED` | Approval age ≤ 15 min | Candidate re-check ALLOW | Open order exists | Result |
|---|---|---|---|---|---|---|
| DT-O01 | Y | * | * | * | * | `MANDATE_ALREADY_SETTLED` |
| DT-O02 | N | N | * | * | * | `MANDATE_NOT_APPROVED` |
| DT-O03 | N | Y | N | * | * | `APPROVAL_EXPIRED` |
| DT-O04 | N | Y | Y | N | * | `POLICY_BLOCKED` |
| DT-O05 | N | Y | Y | Y | Y | `ORDER_ALREADY_OPEN` |
| DT-O06 | N | Y | Y | Y | N | ALLOW |

Approval age exactly 15 minutes is allowed. If FR-024 is cut, the approval-age column is treated as always Y and DT-O03 is removed.

### 8.7 Stage C

| Row | Order `CREATED` | No other captured order | Amount and currency match | PayPal `APPROVED` | Result |
|---|---|---|---|---|---|
| DT-C01 | N | * | * | * | `ORDER_NOT_CREATED` |
| DT-C02 | Y | N | * | * | `MANDATE_ALREADY_SETTLED` |
| DT-C03 | Y | Y | N | * | `AMOUNT_MISMATCH` |
| DT-C04 | Y | Y | Y | N | `PAYPAL_NOT_APPROVED` |
| DT-C05 | Y | Y | Y | Y | ALLOW |

## 9. Reason code registry

Mandate: `BUDGET_MISSING`, `BUDGET_AMBIGUOUS`, `UNSUPPORTED_CURRENCY`, `BUDGET_NOT_POSITIVE`, `BUDGET_EXCEEDS_CAP`, `DEADLINE_IN_PAST`, `DEADLINE_TOO_FAR`.

Candidate: `INCOMPLETE_PRODUCT_DATA`, `CURRENCY_MISMATCH`, `OVER_BUDGET`, `OUT_OF_STOCK`, `LATE_DELIVERY`, `RESTRICTED_CATEGORY`, `EXCLUDED_TERM`.

Order and capture: `MANDATE_NOT_PROPOSED`, `MANDATE_NOT_APPROVED`, `MANDATE_ALREADY_SETTLED`, `APPROVAL_EXPIRED`, `ORDER_ALREADY_OPEN`, `ORDER_NOT_CREATED`, `AMOUNT_MISMATCH`, `PAYPAL_NOT_APPROVED`.

Adding, removing or reordering a rule changes `policy_version` and requires a spec change.

## 10. Known limits

- For live products the restricted-category rule depends on keyword matching of Channel3's category names (`05-AGENT-SPEC.md` §4.4), so a restricted product with an unusual category name can pass R-06.
- The engine trusts the catalog snapshot. A wrong catalog price is out of its reach.
- `deliver_by` and `exclude_terms` come from the model. A misparse can loosen them. The parsed values are shown to the user before approval (FR-017); the budget is not exposed to this risk (SEC-004).
- R-07 is a substring match. A term given in plural form ("candles") will not match a singular title. The parse prompt asks for singular lower-case terms (`05-AGENT-SPEC.md` §3).
