import { expect, test } from "vitest";
import { extractBudget } from "@/policy/extract-budget";
import { validateBudget, validateDeadline } from "@/policy/validate-mandate";

const today = "2026-11-02";

const valid = {
  decision: "ALLOW",
  reason_codes: [],
  primary_reason: null,
  policy_version: "1.0.0",
};

const blocked = (reason: string) => ({
  decision: "BLOCK",
  reason_codes: [reason],
  primary_reason: reason,
  policy_version: "1.0.0",
});

test.each([
  ["DT-M01 M-01 no amount token", "Gift for mom", blocked("BUDGET_MISSING")],
  [
    "DT-M02 M-02 two distinct amounts",
    "$40 or $60",
    blocked("BUDGET_AMBIGUOUS"),
  ],
  ["DT-M03 M-03 currency not USD", "max €40", blocked("UNSUPPORTED_CURRENCY")],
  ["DT-M04 M-04 zero cents", "max $0", blocked("BUDGET_NOT_POSITIVE")],
  ["DT-M05 M-05 50001 cents", "max $500.01", blocked("BUDGET_EXCEEDS_CAP")],
  ["DT-M06 50000 cents", "max $500", valid],
  ["DT-M07 1 cent", "max $0.01", valid],
  ["DT-M12 the same amount twice", "$40, at most $40", valid],
])("UT-POL-002 %s", (_row, text, expected) => {
  expect(validateBudget(extractBudget(text))).toEqual(expected);
});

test.each([
  [
    "M-03 before M-04 for a zero non-USD amount",
    "max €0",
    "UNSUPPORTED_CURRENCY",
  ],
  [
    "M-03 before M-05 for a large non-USD amount",
    "max £5000",
    "UNSUPPORTED_CURRENCY",
  ],
  [
    "M-02 before M-03 for two non-USD amounts",
    "€40 or £60",
    "BUDGET_AMBIGUOUS",
  ],
])("UT-POL-002 precedence: %s", (_name, text, reason) => {
  expect(validateBudget(extractBudget(text))).toEqual(blocked(reason));
});

test.each([
  ["DT-M06 and DT-M07 null deadline", null, valid],
  ["DT-M08 M-06 yesterday", "2026-11-01", blocked("DEADLINE_IN_PAST")],
  ["DT-M09 today", "2026-11-02", valid],
  ["DT-M10 today + 60 days", "2027-01-01", valid],
  ["DT-M11 M-07 today + 61 days", "2027-01-02", blocked("DEADLINE_TOO_FAR")],
  ["M-06 a date in an earlier year", "2025-12-31", blocked("DEADLINE_IN_PAST")],
])("UT-POL-002 %s", (_row, deliverBy, expected) => {
  expect(validateDeadline(deliverBy, today)).toEqual(expected);
});

test("UT-POL-002 the 60-day window crosses a leap day", () => {
  expect(validateDeadline("2028-03-31", "2028-01-31")).toEqual(valid);
  expect(validateDeadline("2028-04-01", "2028-01-31")).toEqual(
    blocked("DEADLINE_TOO_FAR"),
  );
});
