import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const wharf = { latitude: -36.840556, longitude: 174.766389, accuracy: 6 };

test.describe('with location allowed', () => {
  test.use({ geolocation: wharf, permissions: ['geolocation'] });

  test('logs a location, copies it, and keeps it after a reload', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Log location' }).click();

    await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy latitude -36.840556' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy longitude 174.766389' })).toBeVisible();
    await expect(page.getByText('±6 m')).toBeVisible();

    await page.getByLabel('Label').fill('Ferry terminal');
    await page.getByLabel('Label').press('Enter');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Last logged' })).toBeVisible();
    await expect(page.getByLabel('Label')).toHaveValue('Ferry terminal');
  });

  test('has no detectable accessibility violations after logging', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Log location' }).click();
    await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('with location refused', () => {
  test.use({ permissions: [] });

  test('explains how to allow location', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Log location' }).click();
    await expect(page.getByRole('alert')).toContainText('needs permission to use your location');
  });
});
