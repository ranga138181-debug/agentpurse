import { expect, test } from "vitest";
import { evaluateApproval } from "@/policy/evaluate-approval";

const mandate = { id: "mandate-1", status: "PROPOSED" };
const allowed = {
  mandate_id: "mandate-1",
  decision: "ALLOW",
  reason_codes: [],
};
const blocked = {
  mandate_id: "mandate-1",
  decision: "BLOCK",
  reason_codes: ["OVER_BUDGET", "LATE_DELIVERY"],
};

const block = (reason_codes: string[]) => ({
  decision: "BLOCK",
  reason_codes,
  primary_reason: reason_codes[0],
  policy_version: "1.0.0",
});

const allow = {
  decision: "ALLOW",
  reason_codes: [],
  primary_reason: null,
  policy_version: "1.0.0",
};

test.each([
  "REJECTED",
  "FAILED",
  "NO_ELIGIBLE_PRODUCT",
  "APPROVED",
  "DECLINED",
  "SETTLED",
])("UT-POL-012 DT-A01 a %s mandate cannot be approved", (status) => {
  expect(evaluateApproval({ ...mandate, status }, allowed)).toEqual(
    block(["MANDATE_NOT_PROPOSED"]),
  );
});

test("UT-POL-012 DT-A01 takes precedence over a missing or blocked candidate", () => {
  const settled = { ...mandate, status: "SETTLED" };

  expect(evaluateApproval(settled, null)).toEqual(
    block(["MANDATE_NOT_PROPOSED"]),
  );
  expect(evaluateApproval(settled, blocked)).toEqual(
    block(["MANDATE_NOT_PROPOSED"]),
  );
});

test("UT-POL-012 DT-A02 a candidate that does not exist or belongs to another mandate is NOT_FOUND", () => {
  expect(evaluateApproval(mandate, null)).toEqual(block(["NOT_FOUND"]));
  expect(
    evaluateApproval(mandate, { ...allowed, mandate_id: "mandate-2" }),
  ).toEqual(block(["NOT_FOUND"]));
  expect(
    evaluateApproval(mandate, { ...blocked, mandate_id: "mandate-2" }),
  ).toEqual(block(["NOT_FOUND"]));
});

test("UT-POL-012 DT-A03 a BLOCK candidate is refused with its own reason codes", () => {
  expect(evaluateApproval(mandate, blocked)).toEqual(
    block(["OVER_BUDGET", "LATE_DELIVERY"]),
  );
});

test("UT-POL-012 DT-A03 a candidate whose decision is not exactly ALLOW is refused", () => {
  expect(
    evaluateApproval(mandate, { ...allowed, decision: "allow" }).decision,
  ).toBe("BLOCK");
});

test("UT-POL-012 DT-A04 an ALLOW candidate of a PROPOSED mandate is approved", () => {
  expect(evaluateApproval(mandate, allowed)).toEqual(allow);
});

test("UT-POL-012 a decline evaluates A-01 only", () => {
  expect(evaluateApproval(mandate)).toEqual(allow);
  expect(evaluateApproval({ ...mandate, status: "APPROVED" })).toEqual(
    block(["MANDATE_NOT_PROPOSED"]),
  );
});
