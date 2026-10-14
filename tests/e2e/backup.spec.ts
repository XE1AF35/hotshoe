import { expect, test } from '@playwright/test';
import { cameraJpeg } from './helpers.ts';

const wharf = { latitude: -36.840556, longitude: 174.766389, accuracy: 6 };

test.use({ geolocation: wharf, permissions: ['geolocation'] });

test('backs up an entry with its photo and restores it on a fresh install', async ({
  page,
  browser,
}) => {
  // Without file sharing, the backup downloads instead, which Playwright can catch.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined });
  });
  await page.goto('./');
  const jpeg = await cameraJpeg(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Log with photo' }).click();
  await (await chooser).setFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.getByRole('button', { name: 'View photo 1 of 1' })).toBeVisible();
  await page.getByLabel('Label').fill('Ferry terminal');
  await page.getByLabel('Label').press('Enter');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
  await expect(page.getByText('No backup yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Make backup' }).click();
  await expect(page.getByText(/Backup ready: 1 entry, 1 photo/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save or share backup' }).click();
  const file = await (await download).path();
  expect((await download).suggestedFilename()).toMatch(/^hotshoe-backup-\d{8}\.zip$/);
  await expect(page.getByText(/^Last backup:/)).toBeVisible();

  // A separate context has its own empty storage, like a new iPhone.
  const fresh = await browser.newContext();
  const restored = await fresh.newPage();
  await restored.goto(new URL('#/more', page.url()).href);
  const restoreChooser = restored.waitForEvent('filechooser');
  await restored.getByRole('button', { name: 'Restore from a backup' }).click();
  await (await restoreChooser).setFiles(file);

  const sheet = restored.getByRole('dialog', { name: 'Restore backup' });
  await expect(sheet).toContainText('This backup has 1 entry, 0 trips, and 1 photo.');
  await sheet.getByRole('button', { name: 'Restore' }).click();
  await expect(restored.getByText('Restored 1 entry and 1 photo.')).toBeVisible();

  await restored
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Entries' })
    .click();
  await expect(restored.getByRole('button', { name: /Ferry terminal.*1 photo/ })).toBeVisible();
  await fresh.close();
});

test('explains why a file is not a backup', async ({ page }) => {
  await page.goto('./#/more');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore from a backup' }).click();
  await (await chooser).setFiles({
    name: 'notes.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('not a zip'),
  });
  await expect(page.getByRole('alert')).toContainText("isn't a Hotshoe backup");
});
