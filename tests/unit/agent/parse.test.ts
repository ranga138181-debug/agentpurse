import { expect, test, vi } from "vitest";
import { localDate } from "@/agent/dates";
import { parseConstraints } from "@/agent/parse";

const now = new Date("2026-11-02T17:00:00Z");
const timezone = "America/New_York";
const budget = { cents: 4000, currency: "USD" };

function adapterReturning(output: unknown) {
  return {
    parseMandate: vi.fn().mockResolvedValue(output),
    rankProducts: vi.fn(),
  };
}

function input() {
  return {
    text: "Gift for mom, max $40, delivered by Friday",
    ...localDate(now, timezone),
    timezone,
    signal: new AbortController().signal,
  };
}

test("UT-AGT-002 today and weekday are derived from now in the mandate timezone", () => {
  expect(localDate(now, timezone)).toEqual({
    today: "2026-11-02",
    weekday: "Monday",
  });
  const lateEvening = new Date("2026-11-03T03:30:00Z");
  expect(localDate(lateEvening, timezone).today).toBe("2026-11-02");
  expect(localDate(lateEvening, "Asia/Kolkata")).toEqual({
    today: "2026-11-03",
    weekday: "Tuesday",
  });
});

test("UT-AGT-002 valid parse output becomes constraints with the extractor's budget", async () => {
  const adapter = adapterReturning({
    query: "gift for mom",
    deliver_by: "2026-11-06",
    exclude_terms: [],
  });

  const constraints = await parseConstraints(adapter, input(), budget);

  expect(constraints).toEqual({
    max_total_cents: 4000,
    currency: "USD",
    query: "gift for mom",
    deliver_by: "2026-11-06",
    exclude_terms: [],
  });
  expect(adapter.parseMandate).toHaveBeenCalledWith(
    expect.objectContaining({
      text: "Gift for mom, max $40, delivered by Friday",
      today: "2026-11-02",
      weekday: "Monday",
      timezone,
    }),
  );
});

test("UT-AGT-002 exclude terms are lower-cased", async () => {
  const adapter = adapterReturning({
    query: "wallet for dad",
    deliver_by: null,
    exclude_terms: ["Leather", "SUEDE"],
  });

  const constraints = await parseConstraints(adapter, input(), budget);

  expect(constraints.exclude_terms).toEqual(["leather", "suede"]);
});

test("UT-AGT-002 invalid parse output is rejected", async () => {
  const adapter = adapterReturning({
    query: "",
    deliver_by: null,
    exclude_terms: [],
  });

  await expect(parseConstraints(adapter, input(), budget)).rejects.toThrow();
});
