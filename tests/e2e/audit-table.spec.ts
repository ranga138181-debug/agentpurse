import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { auditRow, auditRows, openProposed } from "./support";

test("E2E-004 the decision filter shows only BLOCK rows and CSV export downloads the visible rows", async ({
  page,
}) => {
  await openProposed(page, "Gift for mom, max $40");
  await expect(auditRow(page, "PICK_PROPOSED")).toBeVisible();
  await expect(page.getByText("No Rows To Show")).toBeHidden();
  const allRows = await auditRows(page).count();

  await page
    .locator('.ag-header-cell[col-id="decision"] .ag-header-cell-filter-button')
    .click();
  await page.locator(".ag-filter input[type=text]").first().fill("BLOCK");

  await expect(auditRow(page, "PICK_PROPOSED")).toHaveCount(0);
  const visible = await auditRows(page).count();
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThan(allRows);
  for (const row of await auditRows(page).all()) {
    await expect(row.locator('[col-id="decision"]')).toHaveText("BLOCK");
  }

  await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csv = await readFile(await (await download).path(), "utf8");
  const lines = csv.trim().split(/\r?\n/);

  expect(lines[0]).toContain("Decision");
  expect(lines).toHaveLength(visible + 1);
  for (const line of lines.slice(1)) expect(line).toContain('"BLOCK"');
});

test("E2E-004 clicking a column header sorts the rows", async ({ page }) => {
  await openProposed(page, "Headphones, max $50");
  await expect(auditRow(page, "PICK_PROPOSED")).toBeVisible();
  // The grid positions rows with CSS, so display order comes from row-index, not DOM order.
  const seqs = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".ag-row")]
        .sort(
          (a, b) =>
            Number(a.getAttribute("row-index")) -
            Number(b.getAttribute("row-index")),
        )
        .map((row) => Number(row.querySelector('[col-id="seq"]')?.textContent)),
    );
  const header = page.locator('.ag-header-cell[col-id="seq"]');
  const ascending = (await seqs()).toSorted((a, b) => a - b);

  await header.locator(".ag-header-cell-label").click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect.poll(seqs).toEqual(ascending);
  await header.locator(".ag-header-cell-label").click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect.poll(seqs).toEqual(ascending.toReversed());
});
