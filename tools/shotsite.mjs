import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = '/tmp/site';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const fp = normalize(join(ROOT, p));
    if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const data = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(8099, r));

function findChrome() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(root).filter((d) => d.startsWith('chromium'))) {
    for (const c of [`${root}/${d}/chrome-linux/chrome`, `${root}/${d}/chrome-linux/headless_shell`]) if (existsSync(c)) return c;
  }
}
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:8099/', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/site_top.png' });
await page.addStyleTag({ content: '.reveal{opacity:1 !important;transform:none !important;visibility:visible !important;}' });
await page.evaluate(() => {
  document.querySelectorAll('.reveal').forEach((e) => { e.classList.add('in', 'visible', 'is-visible', 'revealed', 'show', 'active'); });
  document.getElementById('toys')?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(1400);
await page.screenshot({ path: '/tmp/site_toys.png' });
console.log('errors:', errs.slice(0, 5));
await browser.close();
server.close();
