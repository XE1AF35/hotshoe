import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('loads the app without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  await page.goto('./');

  await expect(page.getByRole('heading', { level: 1, name: 'Hotshoe' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('has no detectable WCAG 2.2 AA violations', async ({ page }) => {
  await page.goto('./');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
