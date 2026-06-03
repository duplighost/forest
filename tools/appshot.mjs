import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = process.argv[2] || '/tmp/site/luma';
const OUT = process.argv[3] || '/tmp/thumb_luma.png';
const WAIT = Number(process.argv[4] || 5000);
const W = 1600, H = 900;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const fp = normalize(join(ROOT, p)); if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const d = await readFile(fp); res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(d);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(8077, r));
function findChrome() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(root).filter((d) => d.startsWith('chromium')))
    for (const c of [`${root}/${d}/chrome-linux/chrome`, `${root}/${d}/chrome-linux/headless_shell`]) if (existsSync(c)) return c;
}
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:8077/', { waitUntil: 'load', timeout: 40000 });
await page.waitForTimeout(WAIT);            // let the hint auto-hide & mood warm up
// drag to PAINT bright trails (LUMA reacts to touch), then capture mid-stroke
await page.mouse.move(W * 0.5, H * 0.5);
await page.mouse.down();
for (let i = 0; i < 40; i++) {
  const a = i * 0.45;
  await page.mouse.move(W * (0.5 + 0.34 * Math.cos(a)), H * (0.5 + 0.34 * Math.sin(a * 1.3)), { steps: 2 });
  await page.waitForTimeout(45);
}
await page.screenshot({ path: OUT });
await page.mouse.up();
console.log('wrote', OUT, '| errs:', errs.slice(0, 4));
await browser.close(); server.close();
