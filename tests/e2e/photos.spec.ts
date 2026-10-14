import { expect, test } from '@playwright/test';
import { cameraJpeg } from './helpers.ts';

const wharf = { latitude: -36.840556, longitude: 174.766389, accuracy: 6 };

test.use({ geolocation: wharf, permissions: ['geolocation'] });

test('logs with a photo, keeps it after a reload, and removes it', async ({ page }) => {
  await page.goto('./');
  const jpeg = await cameraJpeg(page);

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Log with photo' }).click();
  await (await chooser).setFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: jpeg });

  await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();
  const thumb = page.getByRole('button', { name: 'View photo 1 of 1' });
  await expect(thumb).toBeVisible();

  await page.reload();
  await thumb.click();
  const viewer = page.getByRole('dialog', { name: 'Photo' });
  const image = viewer.getByRole('img', { name: 'Reference shot for this entry' });
  await expect(image).toBeVisible();
  // Stored at the standard size: the long edge is scaled down to 1,600 px.
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
    .toEqual([1600, 1067]);

  await viewer.getByRole('button', { name: 'Remove', exact: true }).click();
  await viewer.getByRole('button', { name: 'Remove photo' }).click();
  await expect(thumb).toBeHidden();
});

test('adds a library photo to an entry from the Entries tab', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Log location' }).click();
  await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();
  const jpeg = await cameraJpeg(page);

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Entries' })
    .click();
  await page.getByRole('button', { name: /Untitled/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Entry' });

  const chooser = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: 'Add from library' }).click();
  await (await chooser).setFiles([
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg },
    { name: 'b.jpg', mimeType: 'image/jpeg', buffer: jpeg },
  ]);

  await expect(sheet.getByRole('button', { name: 'View photo 2 of 2' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: /Untitled.*2 photos/ })).toBeVisible();
});
