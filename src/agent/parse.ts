import type {
  MandateConstraints,
  ModelAdapter,
  ParseInput,
} from "./model/adapter";
import { parseOutputSchema } from "./schemas";

export async function parseConstraints(
  adapter: ModelAdapter,
  input: ParseInput,
  budget: { cents: number; currency: string },
): Promise<MandateConstraints> {
  const output = parseOutputSchema.parse(await adapter.parseMandate(input));
  return {
    max_total_cents: budget.cents,
    currency: budget.currency,
    query: output.query,
    deliver_by: output.deliver_by,
    exclude_terms: output.exclude_terms.map((term) => term.toLowerCase()),
  };
}
