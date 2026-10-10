import { expect, test } from "@playwright/test";

const SAMPLES = [
  "Gift for mom, max $40, delivered by Friday",
  "Headphones, max $50",
  "Vegan wallet for dad, max $50, nothing leather",
];

test("E2E-005 selecting a sample fills the text field and submits nothing", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") requests.push(request.url());
  });
  await page.goto("/");
  const samples = page.getByRole("group", { name: "Sample mandates" });
  await expect(samples.getByRole("button")).toHaveCount(3);

  for (const sample of SAMPLES) {
    await samples.getByRole("button", { name: sample }).click();
    await expect(page.getByLabel("What should the agent buy")).toHaveValue(
      sample,
    );
  }

  await expect(page.getByRole("heading", { name: "Result" })).toHaveCount(0);
  expect(requests).toEqual([]);
});
