// Fails when the JavaScript needed for first paint grows past the budget.
// Lazy chunks (map, import, export) are excluded because the entry HTML does not reference them.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const budgetBytes = 120 * 1024;
const distDir = 'dist';

const html = await readFile(join(distDir, 'index.html'), 'utf8');
const base = '/hotshoe/';
const scriptPaths = [
  ...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g),
].map((match) => (match[1] ?? '').replace(base, ''));

let totalBytes = 0;
for (const path of new Set(scriptPaths)) {
  const gzipped = gzipSync(await readFile(join(distDir, path))).byteLength;
  totalBytes += gzipped;
  console.log(`${path}: ${(gzipped / 1024).toFixed(1)} KB gzipped`);
}

const summary = `Initial JS: ${(totalBytes / 1024).toFixed(1)} KB of ${budgetBytes / 1024} KB budget`;
if (totalBytes > budgetBytes) {
  console.error(`${summary}. Over budget.`);
  process.exit(1);
}
console.log(summary);
