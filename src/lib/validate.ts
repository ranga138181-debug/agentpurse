import type { z } from "zod";
import { errorResponse } from "./errors";

export function validate<T>(
  schema: z.ZodType<T>,
  input: unknown,
  requestId: string,
): T | Response {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields = result.error.issues.flatMap((issue) =>
    issue.code === "unrecognized_keys" ? issue.keys : [issue.path.join(".")],
  );
  return errorResponse(
    400,
    "VALIDATION_ERROR",
    "Request failed validation",
    requestId,
    { fields },
  );
}
