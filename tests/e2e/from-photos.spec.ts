import { expect, test } from '@playwright/test';
import { addExif } from '../../src/test/exif.ts';
import { cameraJpeg } from './helpers.ts';

test.use({ timezoneId: 'Pacific/Auckland' });

test('adds an entry from a photo, with the photo attached', async ({ page }) => {
  await page.goto('./');
  const jpeg = addExif(await cameraJpeg(page), {
    dateTimeOriginal: '2026:10:14 10:35:12',
    offsetTimeOriginal: '+13:00',
    gps: {
      latitudeRef: 'S',
      latitude: [36, 50, 54.4596],
      longitudeRef: 'E',
      longitude: [174, 45, 48.0096],
      hPositioningError: 8,
    },
  });

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'From photos' }).click();
  await (await chooser).setFiles({
    name: 'IMG_0001.JPG',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpeg),
  });

  const sheet = page.getByRole('dialog', { name: 'From photos' });
  await expect(
    sheet.getByRole('checkbox', { name: /IMG_0001\.JPG.*10:35:12 am.*-36\.848461, 174\.763336/ }),
  ).toBeChecked();
  await sheet.getByRole('button', { name: 'Add 1 entry' }).click();

  await expect(page.getByText('Added 1 entry.')).toBeVisible();
  await page.getByRole('link', { name: 'See them in Entries' }).click();
  await page.getByRole('button', { name: /Untitled.*1 photo/ }).click();
  const entry = page.getByRole('dialog', { name: 'Entry' });
  await expect(entry.getByText('-36.848461')).toBeVisible();
  await expect(entry.getByRole('button', { name: 'View photo 1 of 1' })).toBeVisible();
});
