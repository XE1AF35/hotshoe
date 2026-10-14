import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const wharf = { latitude: -36.840556, longitude: 174.766389, accuracy: 6 };

test.use({ geolocation: wharf, permissions: ['geolocation'] });

test('exports a logged entry as GPX and as CSV', async ({ page }) => {
  // Without file sharing, the export downloads instead, which Playwright can catch.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined });
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Log location' }).click();
  await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();
  await page.getByLabel('Label').fill('Ferry terminal');
  await page.getByLabel('Label').press('Enter');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
  await expect(page.getByLabel('Entries', { exact: true })).toHaveValue('all');
  await expect(page.getByRole('radio', { name: /^GPX/ })).toBeChecked();

  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save or share export' }).click();
  expect((await download).suggestedFilename()).toMatch(/^hotshoe-all-\d{8}\.gpx$/);
  const gpx = await readFile((await (await download).path()) ?? '', 'utf8');
  expect(gpx).toContain('<trkpt lat="-36.840556" lon="174.766389">');
  expect(gpx).toContain('<name>Ferry terminal</name>');
  await expect(page.getByText(/^Exported hotshoe-all-/)).toBeVisible();

  await page.getByRole('radio', { name: /^CSV/ }).check();
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save or share export' }).click();
  const csv = await readFile((await (await download).path()) ?? '', 'utf8');
  expect(csv).toContain(',-36.840556,174.766389,6,');
  expect(csv).toContain(',Ferry terminal,');
});
