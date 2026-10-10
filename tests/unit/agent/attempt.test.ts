import { expect, test, vi } from "vitest";
import {
  AttemptsExhausted,
  DeadlineExceeded,
  withRetry,
  withTimeout,
  type Deadline,
} from "@/agent/attempt";
import { parseConstraints } from "@/agent/parse";
import { searchProducts } from "@/agent/search";

const budget = { cents: 4000, currency: "USD" };
const validOutput = { query: "gift", deliver_by: null, exclude_terms: [] };
const invalidOutput = { query: "", deliver_by: null, exclude_terms: [] };
const never = () => new Promise<never>(() => {});

function deadlineIn(ms: number, remainingMs = ms): Deadline {
  return { signal: AbortSignal.timeout(ms), remainingMs: () => remainingMs };
}

function parseWith(parseMandate: () => Promise<unknown>, deadline: Deadline) {
  const adapter = { parseMandate: vi.fn(parseMandate), rankProducts: vi.fn() };
  const input = {
    text: "Gift, max $40",
    today: "2026-11-02",
    weekday: "Monday",
    timezone: "UTC",
  };
  const result = withRetry(
    (signal) => parseConstraints(adapter, { ...input, signal }, budget),
    50,
    deadline,
  );
  return { adapter, result };
}

test("UT-AGT-006 a call that succeeds first time is not retried", async () => {
  const { adapter, result } = parseWith(
    async () => validOutput,
    deadlineIn(5000),
  );

  expect((await result).query).toBe("gift");
  expect(adapter.parseMandate).toHaveBeenCalledTimes(1);
});

test("UT-AGT-006 one failure is retried once and the retry result is used", async () => {
  const outputs = [invalidOutput, validOutput];
  const { adapter, result } = parseWith(
    async () => outputs.shift(),
    deadlineIn(5000),
  );

  expect((await result).query).toBe("gift");
  expect(adapter.parseMandate).toHaveBeenCalledTimes(2);
});

test.each([
  ["throws", () => Promise.reject(new TypeError("network down")), "TypeError"],
  ["times out", never, "TimeoutError"],
  ["returns invalid output", async () => invalidOutput, "ZodError"],
])(
  "UT-AGT-006 an adapter that %s twice fails closed after two attempts",
  async (_name, parseMandate, errorName) => {
    const { adapter, result } = parseWith(parseMandate, deadlineIn(5000));

    const error = await result.catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AttemptsExhausted);
    expect(error).toMatchObject({ attempts: 2, cause: { name: errorName } });
    expect(adapter.parseMandate).toHaveBeenCalledTimes(2);
  },
);

test("UT-AGT-006 no retry is made when less than one call timeout of the deadline remains", async () => {
  const { adapter, result } = parseWith(
    async () => invalidOutput,
    deadlineIn(5000, 49),
  );

  await expect(result).rejects.toMatchObject({ attempts: 1 });
  expect(adapter.parseMandate).toHaveBeenCalledTimes(1);
});

test("UT-AGT-006 exceeding the request deadline aborts the in-flight call", async () => {
  let received: AbortSignal | undefined;
  const call = (signal: AbortSignal) => {
    received = signal;
    return never();
  };

  await expect(withRetry(call, 5000, deadlineIn(20))).rejects.toBeInstanceOf(
    DeadlineExceeded,
  );
  expect(received?.aborted).toBe(true);
});

test("UT-AGT-006 nothing is called once the deadline has passed", async () => {
  const call = vi.fn(never);
  const deadline = { signal: AbortSignal.abort(), remainingMs: () => 0 };

  await expect(withRetry(call, 50, deadline)).rejects.toBeInstanceOf(
    DeadlineExceeded,
  );
  expect(call).not.toHaveBeenCalled();
});

test("UT-AGT-006 a search that throws is not retried", async () => {
  const source = {
    search: vi.fn().mockRejectedValue(new Error("catalog down")),
  };

  await expect(
    withTimeout(() => searchProducts(source, "gift"), 50, deadlineIn(5000)),
  ).rejects.toThrow("catalog down");
  expect(source.search).toHaveBeenCalledTimes(1);
});

test("UT-AGT-006 a search that hangs times out", async () => {
  const source = { search: vi.fn(never) };

  await expect(
    withTimeout(() => searchProducts(source, "gift"), 20, deadlineIn(5000)),
  ).rejects.toMatchObject({ name: "TimeoutError" });
});
