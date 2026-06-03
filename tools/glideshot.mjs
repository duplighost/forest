import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = process.argv[2] || '/home/user/forest/dist';
const OUT = process.argv[3] || '/tmp/glide_shot.png';
const HASH = process.argv[4] || 'thumb';
const WAIT = Number(process.argv[5] || 3500);
const W = 1600, H = 900;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const fp = normalize(join(ROOT, p)); if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const d = await readFile(fp); res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(d);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(8078, r));
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
await page.goto(`http://localhost:8078/#${HASH}`, { waitUntil: 'load', timeout: 40000 });
// tap to start (dismiss the title hint) then let the mood settle
await page.mouse.click(W * 0.5, H * 0.5);
await page.waitForTimeout(WAIT);
await page.screenshot({ path: OUT });
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 6).join('\n'));
else console.log('no page errors');
await browser.close();
server.close();
