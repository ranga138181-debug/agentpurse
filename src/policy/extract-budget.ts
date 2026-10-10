type Currency = "USD" | "EUR" | "GBP";

export type BudgetExtraction =
  { cents: number; currency: Currency } | "BUDGET_MISSING" | "BUDGET_AMBIGUOUS";

// A number is rejected when more digits or groups follow it, so a malformed amount is never read as a smaller one.
const NUMBER = String.raw`((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![\d]|[.,]\d)`;
const SYMBOL_FIRST = new RegExp(String.raw`(us\$|\$|€|£)\s?${NUMBER}`, "gi");
const WORD_LAST = new RegExp(
  String.raw`(?<![\d.,])${NUMBER}\s?(usd|dollars|dollar|bucks|euros|euro|eur|gbp|pounds|pound)(?![a-z])`,
  "gi",
);

const CURRENCIES: Record<string, Currency> = {
  $: "USD",
  us$: "USD",
  usd: "USD",
  dollar: "USD",
  dollars: "USD",
  bucks: "USD",
  "€": "EUR",
  eur: "EUR",
  euro: "EUR",
  euros: "EUR",
  "£": "GBP",
  gbp: "GBP",
  pound: "GBP",
  pounds: "GBP",
};

function toCents(number: string): number {
  const [whole, fraction = ""] = number.replaceAll(",", "").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function extractBudget(text: string): BudgetExtraction {
  const normalised = text.normalize("NFKC");
  const amounts = new Map<string, { cents: number; currency: Currency }>();
  const add = (unit: string, number: string) => {
    const amount = {
      cents: toCents(number),
      currency: CURRENCIES[unit.toLowerCase()],
    };
    amounts.set(`${amount.currency} ${amount.cents}`, amount);
  };
  for (const match of normalised.matchAll(SYMBOL_FIRST))
    add(match[1], match[2]);
  for (const match of normalised.matchAll(WORD_LAST)) add(match[2], match[1]);
  if (amounts.size === 0) return "BUDGET_MISSING";
  if (amounts.size > 1) return "BUDGET_AMBIGUOUS";
  return [...amounts.values()][0];
}
