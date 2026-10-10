import { eq } from "drizzle-orm";
import { localDate } from "@/agent/dates";
import type { ModelAdapter } from "@/agent/model/adapter";
import { parseConstraints } from "@/agent/parse";
import { fallbackRanking, rankProducts } from "@/agent/rank";
import { searchProducts } from "@/agent/search";
import type { ProductSearch } from "@/agent/search/product";
import { insertAuditEvent } from "@/audit/insert";
import { appendAuditEvent } from "@/audit/writer";
import { db } from "@/db/client";
import { candidates, mandates } from "@/db/schema";
import { errorResponse } from "@/lib/errors";
import { evaluateCandidate } from "@/policy/evaluate-candidate";
import { extractBudget } from "@/policy/extract-budget";
import { validateBudget, validateDeadline } from "@/policy/validate-mandate";
import { selectPick } from "./pick";
import { readMandate } from "./read";

interface MandateInput {
  text: string;
  timezone: string;
  sessionId: string;
  now: Date;
  requestId: string;
}

interface MandateDeps {
  adapter: ModelAdapter;
  searchProvider: string;
  createSearch: (today: string) => ProductSearch;
}

const REJECTION_CODES: Record<string, string> = {
  BUDGET_MISSING: "MANDATE_INCOMPLETE",
  BUDGET_AMBIGUOUS: "MANDATE_AMBIGUOUS",
};

export async function submitMandate(
  { text, timezone, sessionId, now, requestId }: MandateInput,
  { adapter, searchProvider, createSearch }: MandateDeps,
): Promise<Response> {
  const mandateId = crypto.randomUUID();
  const update = (values: Partial<typeof mandates.$inferInsert>) =>
    db.update(mandates).set(values).where(eq(mandates.id, mandateId));
  const audit = (actor: string, event_type: string, extra: object = {}) =>
    appendAuditEvent(insertAuditEvent, {
      session_id: sessionId,
      mandate_id: mandateId,
      actor,
      event_type,
      decision: null,
      reason_codes: [],
      payload: {},
      ...extra,
    });
  const reject = async (reason_codes: string[]) => {
    await update({ status: "REJECTED", reject_reasons: reason_codes });
    await audit("POLICY", "MANDATE_REJECTED", {
      decision: "BLOCK",
      reason_codes,
    });
    return errorResponse(
      422,
      REJECTION_CODES[reason_codes[0]] ?? "MANDATE_INVALID",
      "The mandate was rejected",
      requestId,
      { reason_codes, mandate_id: mandateId },
    );
  };

  // A mandate is stored as FAILED first, so a crash mid-pipeline can never leave it actionable.
  await db.insert(mandates).values({
    id: mandateId,
    session_id: sessionId,
    raw_text: text,
    timezone,
    status: "FAILED",
  });
  await audit("USER", "MANDATE_RECEIVED");

  const budget = extractBudget(text);
  const budgetDecision = validateBudget(budget);
  if (typeof budget === "string" || budgetDecision.decision === "BLOCK") {
    return reject(budgetDecision.reason_codes);
  }

  const { today, weekday } = localDate(now, timezone);
  const { signal } = new AbortController();
  const constraints = await parseConstraints(
    adapter,
    { text, today, weekday, timezone, signal },
    budget,
  );
  await update(constraints);
  await audit("AGENT", "MANDATE_PARSED", { payload: { constraints } });
  const deadlineDecision = validateDeadline(constraints.deliver_by, today);
  if (deadlineDecision.decision === "BLOCK") {
    return reject(deadlineDecision.reason_codes);
  }

  const products = await searchProducts(createSearch(today), constraints.query);
  await audit("AGENT", "SEARCH_COMPLETED", {
    payload: {
      provider: searchProvider,
      product_ids: products.map((product) => product.product_id),
    },
  });

  const ranked = await rankProducts(
    adapter,
    constraints,
    products,
    signal,
  ).catch(async (error: unknown) => {
    await audit("AGENT", "AGENT_ERROR", {
      payload: {
        step: "rank",
        error_code: error instanceof Error ? error.name : "Error",
        fallback: true,
      },
    });
    return fallbackRanking(products);
  });

  const rows = ranked.map(({ product, rank, rationale }) => {
    const { decision, reason_codes, policy_version, total_cents } =
      evaluateCandidate(constraints, product);
    return {
      id: crypto.randomUUID(),
      mandate_id: mandateId,
      product_id: product.product_id,
      title: product.title,
      merchant: product.merchant,
      category: product.category,
      image_url: product.image_url,
      product_url: product.product_url,
      price_cents: product.price_cents,
      shipping_cents: product.shipping_cents,
      tax_cents: product.tax_cents,
      total_cents,
      currency: product.currency,
      estimated_delivery_date: product.estimated_delivery_date,
      in_stock: product.in_stock,
      rank,
      rationale,
      decision,
      reason_codes,
      policy_version,
    };
  });
  if (rows.length > 0) await db.insert(candidates).values(rows);
  const summary = ({
    product_id,
    title,
    total_cents,
    rank,
  }: (typeof rows)[0]) => ({
    payload: { product_id, title, total_cents, rank },
  });
  for (const row of rows) {
    await audit("POLICY", "POLICY_DECISION", {
      ...summary(row),
      decision: row.decision,
      reason_codes: row.reason_codes,
    });
  }

  const pick = selectPick(rows);
  if (pick) {
    await update({ status: "PROPOSED", pick_candidate_id: pick.id });
    await audit("AGENT", "PICK_PROPOSED", summary(pick));
  } else {
    await update({ status: "NO_ELIGIBLE_PRODUCT" });
    await audit("POLICY", "NO_ELIGIBLE_PRODUCT", { decision: "BLOCK" });
  }
  return Response.json(await readMandate(sessionId, mandateId), {
    status: 201,
  });
}
