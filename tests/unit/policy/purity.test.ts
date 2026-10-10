import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { evaluateCandidate } from "@/policy/evaluate-candidate";
import { extractBudget } from "@/policy/extract-budget";
import { validateBudget, validateDeadline } from "@/policy/validate-mandate";

const constraints = {
  max_total_cents: 4000,
  currency: "USD",
  deliver_by: "2026-11-06",
  exclude_terms: ["Leather"],
};

const candidate = {
  product_id: "P-003",
  title: "Spa Gift Basket",
  merchant: "AgentPurse Demo Store",
  category: "beauty",
  currency: "USD",
  in_stock: false,
  price_cents: 3600,
  shipping_cents: 500,
  tax_cents: 0,
  estimated_delivery_date: "2026-11-07",
};

const budget = { cents: 4000, currency: "USD" } as const;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const calls: [string, () => unknown][] = [
  ["evaluateCandidate", () => evaluateCandidate(constraints, candidate)],
  ["extractBudget", () => extractBudget("Gift for mom, max $40 or $60")],
  ["validateBudget", () => validateBudget(budget)],
  ["validateDeadline", () => validateDeadline("2026-11-06", "2026-11-02")],
];

test.each(calls)(
  "UT-POL-013 %s returns deeply equal output over 100 evaluations",
  (_name, call) => {
    const first = call();

    for (let run = 0; run < 100; run++) expect(call()).toEqual(first);
  },
);

test("UT-POL-013 inputs are not mutated", () => {
  const frozenConstraints = deepFreeze(structuredClone(constraints));
  const frozenCandidate = deepFreeze(structuredClone(candidate));
  const frozenBudget = deepFreeze(structuredClone(budget));

  evaluateCandidate(frozenConstraints, frozenCandidate);
  validateBudget(frozenBudget);

  expect(frozenConstraints).toEqual(constraints);
  expect(frozenCandidate).toEqual(candidate);
  expect(frozenBudget).toEqual(budget);
});

const sources = readdirSync("src/policy", { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => [file, readFileSync(`src/policy/${file}`, "utf8")]);

test.each(sources)(
  "UT-POL-013 src/policy/%s imports nothing outside src/policy",
  (_file, source) => {
    const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(
      specifiers.filter((specifier) => !specifier.startsWith("./")),
    ).toEqual([]);
    expect(source).not.toMatch(/\bimport\s*\(|\brequire\s*\(/);
  },
);

test.each(sources)(
  "UT-POL-013 src/policy/%s reads no clock, environment, randomness or network",
  (_file, source) => {
    expect(source).not.toMatch(
      /Date\.now|new Date\(\s*\)|process\.|Math\.random|crypto\.|fetch\(|performance\./,
    );
  },
);
