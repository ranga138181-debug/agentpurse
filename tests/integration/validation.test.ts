import { expect, test } from "vitest";
import { z } from "zod";
import { validate } from "@/lib/validate";

const schema = z.strictObject({ id: z.uuid(), limit: z.int().min(1).max(500) });
const valid = { id: "7b0c1d5e-2f4a-4c6b-8d9e-0a1b2c3d4e5f", limit: 10 };

test("IT-SEC-004 valid input is returned as parsed data", () => {
  expect(validate(schema, valid, "request-1")).toEqual(valid);
});

test.each([
  ["an unknown field", { ...valid, amount: 1 }, ["amount"]],
  ["a wrong type", { ...valid, limit: "ten" }, ["limit"]],
  ["an out-of-range value", { ...valid, limit: 501 }, ["limit"]],
  ["a bad UUID", { ...valid, id: "not-a-uuid" }, ["id"]],
  ["a missing field", { limit: 10 }, ["id"]],
])(
  "IT-SEC-004 %s gives 400 VALIDATION_ERROR naming the field",
  async (_name, input, fields) => {
    const result = validate(schema, input, "request-1");

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.any(String),
        request_id: "request-1",
        details: { fields },
      },
    });
  },
);
