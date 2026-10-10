import { expect, test } from "vitest";
import { parseOutputSchema, rankOutputSchema } from "@/agent/schemas";

const parse = {
  query: "gift for mom",
  deliver_by: "2026-11-06",
  exclude_terms: ["candle"],
};
const rank = {
  ranking: [{ product_id: "P-001", rationale: "A thoughtful gift." }],
};

test("UT-AGT-009 valid parse and rank output is accepted", () => {
  expect(parseOutputSchema.parse(parse)).toEqual(parse);
  expect(
    parseOutputSchema.parse({ ...parse, deliver_by: null, exclude_terms: [] }),
  ).toEqual({
    ...parse,
    deliver_by: null,
    exclude_terms: [],
  });
  expect(rankOutputSchema.parse(rank)).toEqual(rank);
});

test.each([
  ["a missing query", { deliver_by: null, exclude_terms: [] }],
  ["a missing deliver_by", { query: "gift", exclude_terms: [] }],
  ["a missing exclude_terms", { query: "gift", deliver_by: null }],
  ["a non-string query", { ...parse, query: 40 }],
  ["a non-array exclude_terms", { ...parse, exclude_terms: "candle" }],
  ["an empty query", { ...parse, query: "" }],
  ["an 81-character query", { ...parse, query: "q".repeat(81) }],
  [
    "six exclude terms",
    { ...parse, exclude_terms: ["a", "b", "c", "d", "e", "f"] },
  ],
  ["an empty exclude term", { ...parse, exclude_terms: [""] }],
  [
    "a 31-character exclude term",
    { ...parse, exclude_terms: ["t".repeat(31)] },
  ],
  ["a date in the wrong format", { ...parse, deliver_by: "06/11/2026" }],
  ["a date that does not exist", { ...parse, deliver_by: "2026-02-30" }],
  [
    "a timestamp instead of a date",
    { ...parse, deliver_by: "2026-11-06T00:00:00Z" },
  ],
  ["an extra field", { ...parse, notes: "x" }],
  ["a non-object", "gift for mom"],
  ["null", null],
])("UT-AGT-009 parse output with %s is rejected", (_name, output) => {
  expect(parseOutputSchema.safeParse(output).success).toBe(false);
});

test.each([
  ["a missing ranking", {}],
  ["an empty ranking", { ranking: [] }],
  ["a non-array ranking", { ranking: "P-001" }],
  ["a missing rationale", { ranking: [{ product_id: "P-001" }] }],
  [
    "a non-string product_id",
    { ranking: [{ product_id: 1, rationale: "Fits." }] },
  ],
  ["an empty rationale", { ranking: [{ product_id: "P-001", rationale: "" }] }],
  [
    "a 281-character rationale",
    { ranking: [{ product_id: "P-001", rationale: "r".repeat(281) }] },
  ],
  ["an extra top-level field", { ...rank, pick: "P-001" }],
  [
    "an extra item field",
    { ranking: [{ ...rank.ranking[0], url: "https://example.com" }] },
  ],
])("UT-AGT-009 rank output with %s is rejected", (_name, output) => {
  expect(rankOutputSchema.safeParse(output).success).toBe(false);
});
