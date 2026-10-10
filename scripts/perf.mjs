// PERF-001: sends the 30 eval mandate texts to a warm host and checks p95 latency of accepted mandates.
import { readFile, mkdir, writeFile } from "node:fs/promises";

const BASE_URL = process.env.PRODUCTION_URL;
const PACE_MS = 15_000;
const LIMIT_MS = 8_000;

const mandates = JSON.parse(await readFile("tests/eval/mandates.json", "utf8"));
await fetch(`${BASE_URL}/api/healthz`);

let cookie = "";
const results = [];
for (const { id, text } of mandates) {
  const start = performance.now();
  const response = await fetch(`${BASE_URL}/api/mandates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      ...(cookie && { Cookie: cookie }),
    },
    body: JSON.stringify({ text, timezone: "America/New_York" }),
  });
  await response.arrayBuffer();
  // Measured at the client, so it includes network time and is an upper bound on server time.
  const duration_ms = Math.round(performance.now() - start);
  cookie ||= response.headers.get("set-cookie")?.split(";")[0] ?? "";
  results.push({ id, status: response.status, duration_ms });
  console.log(`${id} ${response.status} ${duration_ms} ms`);
  await new Promise((resolve) => setTimeout(resolve, PACE_MS));
}

const accepted = results
  .filter(({ status }) => status === 201)
  .map(({ duration_ms }) => duration_ms)
  .sort((a, b) => a - b);
const p95 = accepted[Math.ceil(accepted.length * 0.95) - 1];
const report = {
  accepted: accepted.length,
  p95_ms: p95,
  limit_ms: LIMIT_MS,
  results,
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/perf-report.json",
  JSON.stringify(report, null, 2),
);
console.log(`accepted ${accepted.length}, p95 ${p95} ms, limit ${LIMIT_MS} ms`);
if (accepted.length === 0 || p95 > LIMIT_MS) process.exit(1);
