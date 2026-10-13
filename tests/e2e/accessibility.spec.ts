import { expect, test } from "@playwright/test";
import {
  auditRow,
  candidate,
  expectAccessible,
  openProposed,
  submitMandate,
} from "./support";

test("E2E-006 the empty state has no serious or critical axe violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

  await expectAccessible(page);
});

test("E2E-006 the proposed and approved states have no serious or critical axe violations", async ({
  page,
}) => {
  await openProposed(page, "Headphones, max $50");
  await expect(auditRow(page, "PICK_PROPOSED")).toBeVisible();
  await expectAccessible(page);

  await candidate(page, "Budget Earbuds")
    .getByRole("button", { name: /Approve/ })
    .click();
  await expect(page.getByText("Approved: Budget Earbuds")).toBeVisible();
  await expect(auditRow(page, "USER_APPROVED")).toBeVisible();
  await expectAccessible(page);
});

test("E2E-006 the rejected state names the problem and has no serious or critical axe violations", async ({
  page,
}) => {
  await page.goto("/");
  await submitMandate(page, "Gift for mom delivered by Friday");

  await expect(page.locator("p.error")).toContainText("No budget found");
  await expect(auditRow(page, "MANDATE_REJECTED")).toBeVisible();
  await expectAccessible(page);
});

test("E2E-006 a mandate can be submitted and a candidate approved with the keyboard only", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  const focused = () =>
    page.evaluate(() => document.activeElement?.textContent ?? "");
  const tabTo = async (text: string) => {
    for (let presses = 0; presses < 40; presses++) {
      await page.keyboard.press("Tab");
      if ((await focused()).startsWith(text)) return;
    }
    throw new Error(`Could not reach "${text}" with the Tab key`);
  };

  // The section links in the top bar come first in the tab order.
  const field = page.getByLabel("What should the agent buy");
  for (let presses = 0; presses < 10; presses++) {
    await page.keyboard.press("Tab");
    if (await field.evaluate((node) => node === document.activeElement)) break;
  }
  await expect(field).toBeFocused();
  await page.keyboard.type("Headphones, max $50");
  await tabTo("Ask agent");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();

  await tabTo("Approve Budget Earbuds");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Approved: Budget Earbuds")).toBeVisible();
});
