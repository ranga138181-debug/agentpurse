import { expect, test } from "vitest";
import { mandateRequestSchema } from "@/agent/schemas";

const timezone = "America/New_York";

test.each([
  ["one character", "x"],
  ["500 characters", "x".repeat(500)],
  ["500 characters after trimming", `  ${"x".repeat(500)}  `],
])("UT-AGT-001 text of %s is accepted and kept unchanged", (_name, text) => {
  expect(mandateRequestSchema.parse({ text, timezone })).toEqual({
    text,
    timezone,
  });
});

test.each([
  ["empty", ""],
  ["whitespace only", "   "],
  ["tabs and newlines only", "\t\n "],
  ["501 characters", "x".repeat(501)],
  ["a number", 40],
])("UT-AGT-001 text that is %s is rejected", (_name, text) => {
  const result = mandateRequestSchema.safeParse({ text, timezone });

  expect(result.success).toBe(false);
  expect(result.error?.issues[0].path).toEqual(["text"]);
});

test.each(["America/New_York", "Asia/Kolkata", "Asia/Calcutta", "UTC"])(
  "UT-AGT-001 timezone %s is accepted",
  (zone) => {
    expect(
      mandateRequestSchema.safeParse({ text: "gift", timezone: zone }).success,
    ).toBe(true);
  },
);

test.each([
  ["an unknown zone", "Mars/Olympus"],
  ["an empty string", ""],
  ["a UTC offset", "+05:30"],
  ["an abbreviation that is not a zone", "IST"],
  ["a number", 5],
])("UT-AGT-001 timezone that is %s is rejected", (_name, zone) => {
  const result = mandateRequestSchema.safeParse({
    text: "gift",
    timezone: zone,
  });

  expect(result.success).toBe(false);
  expect(result.error?.issues[0].path).toEqual(["timezone"]);
});

test("UT-AGT-001 a missing timezone or an unknown field is rejected", () => {
  expect(mandateRequestSchema.safeParse({ text: "gift" }).success).toBe(false);
  expect(
    mandateRequestSchema.safeParse({
      text: "gift",
      timezone,
      max_total_cents: 999999,
    }).success,
  ).toBe(false);
});
