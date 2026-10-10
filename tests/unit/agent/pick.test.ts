import { expect, test } from "vitest";
import { selectPick } from "@/app/api/mandates/pick";

const candidate = (id: string, rank: number, decision: string) => ({
  id,
  rank,
  decision,
});

test("UT-AGT-005 the pick is the first ALLOW candidate by rank", () => {
  const candidates = [
    candidate("a", 1, "BLOCK"),
    candidate("b", 2, "ALLOW"),
    candidate("c", 3, "ALLOW"),
  ];

  expect(selectPick(candidates)).toBe(candidates[1]);
});

test("UT-AGT-005 rank decides the pick, not list order", () => {
  const candidates = [
    candidate("c", 3, "ALLOW"),
    candidate("a", 1, "BLOCK"),
    candidate("b", 2, "ALLOW"),
  ];

  expect(selectPick(candidates)).toBe(candidates[2]);
});

test("UT-AGT-005 there is no pick when every candidate is BLOCK", () => {
  expect(
    selectPick([candidate("a", 1, "BLOCK"), candidate("b", 2, "BLOCK")]),
  ).toBeNull();
});

test("UT-AGT-005 there is no pick for an empty list", () => {
  expect(selectPick([])).toBeNull();
});
