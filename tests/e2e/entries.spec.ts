import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

test.use({
  geolocation: { latitude: -36.840556, longitude: 174.766389, accuracy: 6 },
  permissions: ['geolocation'],
});

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test('logs into a new trip, then edits, deletes, and restores the entry', async ({ page }) => {
  await page.goto('./');

  // Create a trip from the Log screen and make it active.
  await page.getByRole('button', { name: /Trip: None/ }).click();
  const picker = page.getByRole('dialog', { name: 'Trip for new entries' });
  await picker.getByLabel('New trip').fill('Waiheke');
  await picker.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('button', { name: /Trip: Waiheke/ })).toBeVisible();

  await page.getByRole('button', { name: 'Log location' }).click();
  await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();
  await page.getByLabel('Frame').fill('3');
  await page.getByLabel('Frame').press('Enter');

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Entries' })
    .click();
  await expect(page.getByText('Waiheke')).toBeVisible();
  await page.getByRole('button', { name: /Untitled/ }).click();

  const sheet = page.getByRole('dialog', { name: 'Entry' });
  await expect(sheet).toBeVisible();
  await axe(page);
  await sheet.getByLabel('Label').fill('Ferry wharf');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: /Ferry wharf.*Frame 3/ })).toBeVisible();

  await page.getByRole('button', { name: /Ferry wharf/ }).click();
  await sheet.getByRole('button', { name: 'Delete entry' }).click();
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Nothing logged yet')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Ferry wharf/ })).toBeVisible();
});

test('closes a sheet with Escape and returns focus', async ({ page }) => {
  await page.goto('./#/more');
  await page.getByLabel('New trip').fill('Raglan');
  await page.getByRole('button', { name: 'Add' }).click();

  const row = page.getByRole('button', { name: /Raglan/ });
  await row.click();
  await expect(page.getByRole('dialog', { name: 'Trip' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Trip' })).toBeHidden();
  await expect(row).toBeFocused();
  await axe(page);
});
