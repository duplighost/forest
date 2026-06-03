// Headless visual verification.
//
// Spins up a Vite dev server in-process, opens the game in headless Chromium
// with software WebGL (SwiftShader), optionally drives it via window.__GAME,
// and writes a PNG. Surfaces console errors / page exceptions so rendering
// or logic failures are visible from the terminal.
//
//   node tools/screenshot.mjs [out=shot.png] [waitMs=3500] [w=1280] [h=720] [hash=]
//
// Example driving a state:  node tools/screenshot.mjs glide.png 1000 1280 720 'glide'
// The optional [hash] is appended as `#cmd` and read by main.js to pose the
// player for the shot (e.g. 'glide', 'climb', 'swim', 'high').

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';

// The sandbox blocks Playwright's browser CDN, but a Chromium build is
// pre-baked into the image. Find it and launch that directly.
function findChrome() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root).filter((d) => d.startsWith('chromium'));
  for (const d of dirs) {
    for (const p of [`${root}/${d}/chrome-linux/chrome`, `${root}/${d}/chrome-linux/headless_shell`]) {
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const [, , outArg, waitArg, wArg, hArg, hashArg] = process.argv;
const out = outArg || 'shot.png';
const waitMs = Number(waitArg || 3500);
const width = Number(wArg || 1280);
const height = Number(hArg || 720);
const hash = hashArg ? `#${hashArg}` : '';

const server = await createServer({
  configFile: new URL('../vite.config.js', import.meta.url).pathname,
  server: { port: 0 },
  logLevel: 'error',
});
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, '') + '/' + hash;

const browser = await chromium.launch({
  headless: true,
  executablePath: findChrome(),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 1,
});

const errors = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') errors.push(`[${t}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

try {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  // Let the world generate and a few frames render under software GL.
  await page.waitForTimeout(waitMs);

  // Report some runtime telemetry if the game exposes it.
  const info = await page.evaluate(() => {
    const g = window.__GAME;
    if (!g) return { ready: false };
    return g.debugInfo ? g.debugInfo() : { ready: true };
  });
  console.log('telemetry:', JSON.stringify(info));

  await page.screenshot({ path: out });
  console.log('wrote', out);
} catch (e) {
  console.error('screenshot failed:', e.message);
} finally {
  if (errors.length) {
    console.error('--- page diagnostics (' + errors.length + ') ---');
    for (const e of errors.slice(0, 40)) console.error(e);
  } else {
    console.log('no console errors/warnings');
  }
  await browser.close();
  await server.close();
}
