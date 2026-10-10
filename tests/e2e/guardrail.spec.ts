import { expect, test } from "@playwright/test";
import { auditRow, candidate, openProposed, submitMandate } from "./support";

test("E2E-002 an over-budget product is blocked in the UI and through the API", async ({
  page,
}) => {
  await openProposed(page, "Headphones, max $50");

  const blocked = candidate(page, "Premium Studio Headphones");
  await expect(blocked).toContainText("BLOCK");
  await expect(blocked).toContainText("OVER_BUDGET");
  await expect(blocked.getByRole("button")).toHaveCount(0);
  await expect(
    candidate(page, "Budget Earbuds").getByRole("button", { name: /Approve/ }),
  ).toBeVisible();

  const result = await page.evaluate(async () => {
    const audit = await fetch("/api/audit").then((r) => r.json());
    const mandateId = audit.events[0].mandate_id;
    const mandate = await fetch(`/api/mandates/${mandateId}`).then((r) =>
      r.json(),
    );
    const target = mandate.candidates.find(
      (c: { product_id: string }) => c.product_id === "P-011",
    );
    const response = await fetch(`/api/mandates/${mandateId}/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "APPROVE", candidate_id: target.id }),
    });
    return { status: response.status, body: await response.json() };
  });

  expect(result.status).toBe(409);
  expect(result.body.error.code).toBe("POLICY_BLOCKED");
  const row = auditRow(page, "APPROVAL_BLOCKED");
  await expect(row).toBeVisible();
  await expect(row).toContainText("BLOCK");
  await expect(row).toContainText("OVER_BUDGET");
});

test("E2E-003 new audit rows appear within 2 seconds without a reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  let reloads = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) reloads += 1;
  });

  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/mandates") && r.request().method() === "POST",
  );
  await submitMandate(page, "Headphones, max $50");
  await response;

  await expect(auditRow(page, "PICK_PROPOSED")).toBeVisible({ timeout: 2000 });
  await expect(auditRow(page, "MANDATE_RECEIVED")).toBeVisible();
  await expect(auditRow(page, "POLICY_DECISION")).toHaveCount(3);
  expect(reloads).toBe(0);
});

test("E2E-008 product text with markup renders as plain text and runs no script", async ({
  page,
}) => {
  let dialogs = 0;
  page.on("dialog", async (dialog) => {
    dialogs += 1;
    await dialog.dismiss();
  });

  await openProposed(page, "Phone case under $20");

  await expect(
    page.getByRole("heading", { name: "1. Phone Case Agent's pick" }),
  ).toBeVisible();
  await expect(page.locator("li.candidate img")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("onerror");
  await expect(auditRow(page, "PICK_PROPOSED")).toBeVisible();
  expect(dialogs).toBe(0);
});
