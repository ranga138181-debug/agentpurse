import { expect, test } from "@playwright/test";
import { auditRow, candidate, expectAccessible, openProposed } from "./support";

const email = process.env.PAYPAL_BUYER_EMAIL;
const password = process.env.PAYPAL_BUYER_PASSWORD;

// Needs the PayPal sandbox buyer account, which is held in CI secrets.
test.skip(!email || !password, "PayPal sandbox buyer credentials are absent");

// REL-001 repeats this test against production, where the model provider limits requests per minute.
test.afterEach(
  () =>
    new Promise((resolve) =>
      setTimeout(resolve, Number(process.env.REL_PACE_MS ?? 0)),
    ),
);

test("E2E-001 an approved pick is paid in the PayPal sandbox and settles", async ({
  page,
}) => {
  await openProposed(page, "Gift for mom, max $40");
  await expect(page.locator("li.candidate .pick")).toHaveCount(1);
  const pick = candidate(page, "Agent's pick");
  await pick.getByRole("button", { name: /Approve/ }).click();
  await expect(page.getByText(/^Approved: /)).toBeVisible();

  const popupPromise = page.waitForEvent("popup");
  await page
    .frameLocator('iframe[title="PayPal-paypal"]')
    .first()
    .getByRole("link", { name: /PayPal/ })
    .click();
  const popup = await popupPromise;
  await popup.locator("#email").fill(email as string);
  const next = popup.locator("#btnNext");
  if (await next.isVisible()) await next.click();
  await popup.locator("#password").fill(password as string);
  await popup.locator("#btnLogin").click();
  await popup
    .getByRole("button", {
      name: /Complete Purchase|Continue to Review Order|Pay/,
    })
    .click();

  await expect(
    page.getByText(/Payment complete\. PayPal order ID: \S+/),
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(auditRow(page, "ORDER_CAPTURED")).toBeVisible();
  // The settled state is scanned here because only a real payment reaches it (E2E-006).
  await expectAccessible(page);
});
