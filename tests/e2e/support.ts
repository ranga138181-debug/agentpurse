import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function submitMandate(page: Page, text: string) {
  await page.getByLabel("What should the agent buy").fill(text);
  await page.getByRole("button", { name: "Ask agent" }).click();
}

export function candidate(page: Page, title: string) {
  return page.locator("li.candidate").filter({ hasText: title });
}

export function auditRows(page: Page) {
  return page.locator(".ag-row");
}

export function auditRow(page: Page, eventType: string) {
  return auditRows(page).filter({ hasText: eventType });
}

export async function openProposed(page: Page, text: string) {
  await page.goto("/");
  await submitMandate(page, text);
  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
}

// PayPal's own button frame is outside this app's control and is not scanned.
export async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .exclude("iframe")
    .analyze();
  const blocking = violations
    .filter(({ impact }) => impact === "serious" || impact === "critical")
    .map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(" ")}`);
  expect(blocking).toEqual([]);
}
