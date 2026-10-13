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

test("E2E-009 the store panel lists the 20 fixture products as plain text", async ({
  page,
}) => {
  let dialogs = 0;
  page.on("dialog", async (dialog) => {
    dialogs += 1;
    await dialog.dismiss();
  });
  await page.goto("/");

  const tiles = page
    .getByRole("region", { name: "Store" })
    .getByRole("listitem");
  await expect(tiles).toHaveCount(20);
  const candle = tiles.filter({ hasText: "Scented Candle Gift Set" });
  await expect(candle).toContainText("home");
  await expect(candle).toContainText("$24.99");
  await expect(candle).toContainText("$4.99 shipping");
  await expect(tiles.filter({ hasText: "Silk Scarf" })).toContainText(
    "Free shipping",
  );
  await expect(tiles.filter({ hasText: "Out of stock" })).not.toHaveCount(0);
  await expect(tiles.getByText("Phone Case", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Store" })).not.toContainText(
    "onerror",
  );
  await expect(
    page.getByRole("region", { name: "Store" }).getByRole("button"),
  ).toHaveCount(0);
  expect(dialogs).toBe(0);
});

test("E2E-010 the impact summary starts at zero and counts the session's decisions", async ({
  page,
}) => {
  await page.goto("/");
  const figure = (label: string) =>
    page
      .getByRole("region", { name: "Impact" })
      .locator("div")
      .filter({ hasText: label })
      .locator("dd");
  await expect(figure("Products checked")).toHaveText("0");
  await expect(figure("Blocked by policy")).toHaveText("0");
  await expect(figure("Over-budget spend stopped")).toHaveText("$0.00");
  await expect(figure("Payments settled")).toHaveText("0");

  await openProposed(page, "Headphones, max $50");

  await expect(figure("Products checked")).toHaveText("3");
  await expect(figure("Blocked by policy")).toHaveText("1");
  await expect(figure("Over-budget spend stopped")).toHaveText("$199.00");
  await expect(figure("Payments settled")).toHaveText("0");
});

// Uses one real Channel3 search, so it runs only where the key is present.
test("E2E-011 live products come from Channel3 with retailer names, decisions and the demo-store terms", async ({
  page,
}) => {
  test.skip(!process.env.CHANNEL3_API_KEY, "No Channel3 key is configured");
  await page.goto("/");
  const store = page.getByRole("region", { name: "Store" });
  await expect(store.getByRole("listitem")).toHaveCount(20);

  await page.getByLabel("Live products (Channel3)").check();
  await expect(store).toContainText("demo-store terms");
  await expect(store.getByRole("listitem")).toHaveCount(0);
  await openProposedLive(page, "Wireless earbuds, max $200");

  const cards = page.locator("li.candidate");
  await expect(cards.first()).toBeVisible();
  await expect(cards.first()).toContainText(/ALLOW|BLOCK/);
  await expect(cards.first()).toContainText(/[a-z0-9-]+\.[a-z]{2,}/);
  await expect(store.getByRole("listitem")).toHaveCount(await cards.count());
  await expect(auditRow(page, "SEARCH_COMPLETED")).toBeVisible();

  await page.getByLabel("Demo store").check();
  await expect(store.getByRole("listitem")).toHaveCount(20);
});

async function openProposedLive(page: Page, text: string) {
  await page.getByLabel("What should the agent buy").fill(text);
  await page.getByRole("button", { name: "Ask agent" }).click();
  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible({
    timeout: 15_000,
  });
}

test("E2E-012 the passbook starts empty and lists the session's notable events newest first", async ({
  page,
}) => {
  await page.goto("/");
  const passbook = page.getByRole("region", { name: "Passbook" });
  await expect(passbook).toContainText("No activity yet.");
  await expect(passbook.getByRole("listitem")).toHaveCount(0);

  await openProposed(page, "Headphones, max $50");

  const entries = passbook.getByRole("listitem");
  await expect(entries.first()).toContainText(
    "Agent proposed Wireless Earbuds Pro",
  );
  await expect(entries.first()).toContainText("$49.99");
  const blocked = entries.filter({
    hasText: "Blocked Premium Studio Headphones",
  });
  await expect(blocked).toContainText("$199.00");
  await expect(blocked).toContainText("The total is over your budget.");
  await expect(passbook).not.toContainText("No activity yet.");

  await openProposed(page, "Gift for mom, max $40");
  await expect(entries.first()).toContainText("Agent proposed");
  await expect(entries.nth(1)).toContainText(/Blocked \d+ products/);
  await expect(entries.nth(1)).toContainText(/, /);
});
