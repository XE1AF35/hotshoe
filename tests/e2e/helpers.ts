import type { Page } from '@playwright/test';

/** Draws a 3,000 by 2,000 JPEG in the page, larger than the stored size, and returns its bytes. */
export async function cameraJpeg(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 2000;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2D context');
    context.fillStyle = '#0369a1';
    context.fillRect(0, 0, 3000, 2000);
    context.fillStyle = '#f59e0b';
    context.fillRect(1000, 600, 1000, 800);
    return canvas.toDataURL('image/jpeg', 0.8);
  });
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
}
