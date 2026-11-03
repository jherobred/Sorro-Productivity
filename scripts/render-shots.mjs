/* Renders the redesigned screens to PNG for the visual gate. Dev-only tool:
   run with `node scripts/render-shots.mjs` while `npm run dev` is up. Uses
   dev fixtures (NEXT_PUBLIC_DEV_FIXTURES=1), so no real account is touched. */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = join(tmpdir(), 'sorro-shots');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3001';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const SHOTS = [
  { name: 'shelf-desktop-dark', url: '/notebooks/', viewport: { width: 1440, height: 900 }, theme: 'dark' },
  { name: 'notebooks-desktop-dark', url: '/notebooks/?tab=notebooks', viewport: { width: 1440, height: 900 }, theme: 'dark' },
  { name: 'notebooks-desktop-light', url: '/notebooks/?tab=notebooks', viewport: { width: 1440, height: 900 }, theme: 'light' },
  { name: 'shelf-desktop-light', url: '/notebooks/', viewport: { width: 1440, height: 900 }, theme: 'light' },
  { name: 'shelf-phone-dark', url: '/notebooks/', viewport: { width: 390, height: 844 }, theme: 'dark' },
  { name: 'notebooks-phone-dark', url: '/notebooks/?tab=notebooks', viewport: { width: 390, height: 844 }, theme: 'dark' },
  { name: 'notebooks-phone-light', url: '/notebooks/?tab=notebooks', viewport: { width: 390, height: 844 }, theme: 'light' },
];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  // Pre-visit to seed localStorage: mark every tour flag done, theme default.
  await page.goto(`${BASE}/notebooks/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/tour/i.test(k)) localStorage.setItem(k, 'done');
    }
    localStorage.setItem('sorro-seen-onboardings-v1', JSON.stringify(['notebooks']));
  });

  for (const s of SHOTS) {
    await page.setViewport({ width: s.viewport.width, height: s.viewport.height });
    await page.evaluate((theme) => {
      const raw = localStorage.getItem('sorro-prefs');
      const prefs = raw ? JSON.parse(raw) : {};
      prefs.theme = theme;
      localStorage.setItem('sorro-prefs', JSON.stringify(prefs));
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/tour/i.test(k)) localStorage.setItem(k, 'done');
      }
      localStorage.setItem('sorro-seen-onboardings-v1', JSON.stringify(['notebooks']));
    }, s.theme);
    await page.goto(`${BASE}${s.url}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2600));
    await page.screenshot({ path: join(OUT, `${s.name}.png`) });
    console.log('saved', s.name);
  }
} finally {
  await browser.close();
}
console.log('OUT', OUT);
