import { expect, test, type Locator, type Page } from "@playwright/test";
import { auditRow, candidate, openProposed } from "./support";

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

const WIDTH = 360;

async function expectNoHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(WIDTH);
}

async function expectReachable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport({ ratio: 1 });
  const box = await control.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(WIDTH);
}

test("E2E-007 at 360 px there is no horizontal page scroll and approve and pay are reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: WIDTH, height: 740 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await openProposed(page, "Headphones, max $50");
  await expect(auditRow(page, "PICK_PROPOSED")).toBeVisible();
  await expectNoHorizontalScroll(page);
  const approve = candidate(page, "Budget Earbuds").getByRole("button", {
    name: /Approve/,
  });
  await expectReachable(approve);

  await approve.click();
  const pay = page.locator('iframe[title="PayPal-paypal"]').first();
  await expect(pay).toBeVisible({ timeout: 20_000 });
  await expectReachable(pay);
  await expectNoHorizontalScroll(page);
});
