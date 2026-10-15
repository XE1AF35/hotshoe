import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const wharf = { latitude: -36.840556, longitude: 174.766389, accuracy: 6 };

test.use({
  geolocation: wharf,
  permissions: ['geolocation'],
  timezoneId: 'Pacific/Auckland',
});

test('summarises a trip in its sheet', async ({ page, context }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Trip: None/ }).click();
  const picker = page.getByRole('dialog', { name: 'Trip for new entries' });
  await picker.getByLabel('New trip').fill('Waiheke');
  await picker.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Log location' }).click();
  await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();

  // A weak fix about 1.1 km north.
  await context.setGeolocation({ ...wharf, latitude: wharf.latitude + 0.01, accuracy: 80 });
  await page.getByRole('button', { name: 'Log location' }).click();
  await page.getByRole('button', { name: 'Use this fix' }).click();
  await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
  await page.getByRole('button', { name: /^Waiheke/ }).click();
  const summary = page
    .getByRole('dialog', { name: 'Trip' })
    .getByRole('region', { name: 'Summary' });
  await expect(summary).toContainText('Entries2');
  await expect(summary).toContainText('Photos0');
  await expect(summary).toContainText('Days1');
  await expect(summary).toContainText('DistanceAbout 1.1 km');
  await expect(summary).toContainText('Weak fixes1, less accurate than ±20 m');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // Reflows at 200% text size without sideways scrolling (WCAG 1.4.10).
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const overflowing = await summary.evaluate((region) => {
    const width = document.documentElement.clientWidth;
    return [...region.querySelectorAll('*')]
      .filter((element) => element.getBoundingClientRect().right > width + 1)
      .map((element) => element.textContent);
  });
  expect(overflowing).toEqual([]);
});
