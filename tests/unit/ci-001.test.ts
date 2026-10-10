import { expect, test } from "vitest";

test("CI-001 deliberately failing test to verify branch protection", () => {
  expect(1).toBe(2);
});
