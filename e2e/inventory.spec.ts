import { expect, test } from '@playwright/test';
import { createDraftProduct, registerSellerUI } from './helpers';

test('seller manages stock: alerts, ledger, counts and reconciliation', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const sku = `INV-${stamp}`.toUpperCase();
  const name = `E2E Stock Item ${stamp}`;
  await registerSellerUI(page, stamp);
  await createDraftProduct(page, { name, sku, stock: 6, reorder: 5, price: 2000 });

  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  const row = page.getByRole('row', { name: new RegExp(sku) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('In stock');
  await expect(page.getByText('All healthy')).toBeVisible();

  const dialog = page.getByRole('dialog');

  // Stock out below the reorder level raises a reorder alert and a notification.
  await row.getByRole('button', { name: `More actions for ${sku}` }).click();
  await page.getByRole('menuitem', { name: 'Stock out' }).click();
  await dialog.getByLabel('Quantity').fill('1');
  await expect(dialog.getByText(/Available after/)).toContainText('5');
  await dialog.getByRole('button', { name: 'Stock out' }).click();
  // A reason is mandatory.
  await expect(dialog.getByText(/Say why the stock is leaving/)).toBeVisible();
  await dialog.getByLabel('Reason').fill('Sold offline');
  await dialog.getByRole('button', { name: 'Stock out' }).click();
  await expect(page.getByText(/Stock updated: 6 → 5/)).toBeVisible();
  await expect(row).toContainText('Reorder');
  await expect(page.getByText(/Reorder required for 1 SKU/)).toBeVisible();
  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.getByText(`Reorder needed: ${name}`)).toBeVisible();
  await page.keyboard.press('Escape');

  // Taking more than is available is blocked with a clear message.
  await row.getByRole('button', { name: `More actions for ${sku}` }).click();
  await page.getByRole('menuitem', { name: 'Stock out' }).click();
  await dialog.getByLabel('Quantity').fill('50');
  await expect(dialog.getByText('not enough stock')).toBeVisible();
  await dialog.getByLabel('Reason').fill('Too many');
  await dialog.getByRole('button', { name: 'Stock out' }).click();
  await expect(dialog.getByText(/Insufficient stock/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Stock in restores a healthy level.
  await row.getByRole('button', { name: 'Stock in' }).click();
  await dialog.getByLabel('Quantity').fill('10');
  await dialog.getByLabel('Reference no. (optional)').fill('PO-1001');
  await dialog.getByRole('button', { name: 'Stock in' }).click();
  await expect(page.getByText(/Stock updated: 5 → 15/)).toBeVisible();
  await expect(row).toContainText('In stock');
  await expect(row.getByRole('cell', { name: '15', exact: true })).toBeVisible();

  // Physical count with a shortfall opens a discrepancy and does not change stock yet.
  await row.getByRole('button', { name: `More actions for ${sku}` }).click();
  await page.getByRole('menuitem', { name: 'Record physical count' }).click();
  await dialog.getByLabel('Counted quantity').fill('12');
  await expect(dialog.getByText(/Discrepancy: -3/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Record count' }).click();
  await expect(page.getByText(/Discrepancy of -3 recorded/)).toBeVisible();
  await expect(page.getByText(/1 inventory discrepancy/)).toBeVisible();
  await expect(row.getByRole('cell', { name: '15', exact: true })).toBeVisible();

  await page.getByRole('tab', { name: /Counts/ }).click();
  const countRow = page.getByRole('row', { name: new RegExp(sku) });
  await expect(countRow).toContainText('Needs review');
  await countRow.getByRole('button', { name: 'Apply correction' }).click();
  await expect(page.getByText('Correction applied to stock')).toBeVisible();
  await expect(page.getByText('No discrepancies')).toBeVisible();

  // The ledger holds every movement, newest first, with signed quantities and references.
  await page.getByRole('tab', { name: 'Movement ledger' }).click();
  const types = ['Reconciled', 'Stock in', 'Stock out', 'Opening stock'];
  const ledgerRows = page.getByRole('row').filter({ hasText: sku });
  await expect(ledgerRows).toHaveCount(types.length);
  for (const [i, t] of types.entries()) await expect(ledgerRows.nth(i)).toContainText(t);
  await expect(ledgerRows.nth(1)).toContainText('+10');
  await expect(ledgerRows.nth(1)).toContainText('PO-1001');
  await expect(ledgerRows.nth(0)).toContainText('−3');
  await expect(ledgerRows.nth(0)).toContainText('15 → 12');

  // Filter the ledger by type.
  await page.getByLabel('Movement type').click();
  await page.getByRole('option', { name: 'Stock in' }).click();
  await expect(ledgerRows).toHaveCount(1);

  // Dashboard widget reflects the live numbers.
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Inventory', level: 2 })).toBeVisible();
  await expect(page.getByText('All stock levels are healthy.')).toBeVisible();

  expect(errors.filter((e) => !/Failed to load resource.*409/.test(e)), errors.join('\n')).toEqual([]);
});
