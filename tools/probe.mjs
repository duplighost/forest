import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = '/home/user/forest/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png' };
const server = createServer(async (req,res)=>{ try{ let p=decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/'))p+='index.html'; const fp=normalize(join(ROOT,p)); if(!fp.startsWith(ROOT)){res.writeHead(403);return res.end();} const d=await readFile(fp); res.writeHead(200,{'Content-Type':MIME[extname(fp)]||'application/octet-stream'}); res.end(d);}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(8079,r));
function findChrome(){const root='/opt/pw-browsers';for(const d of readdirSync(root).filter(d=>d.startsWith('chromium')))for(const c of [`${root}/${d}/chrome-linux/chrome`,`${root}/${d}/chrome-linux/headless_shell`])if(existsSync(c))return c;}
const browser=await chromium.launch({executablePath:findChrome(),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:900,height:600}});
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:8079/',{waitUntil:'load',timeout:40000});
await page.mouse.click(450,300);
await page.waitForTimeout(2500);
const r = await page.evaluate(()=>{
  const g=window.__GAME, c=g.critters, p=g.player;
  // place a butterfly right next to the player, resting low, not fleeing
  const b=c.list[0];
  b.placed=true; b.rest=0; b.flee=0;
  b.pos.set(p.position.x+1.2, p.position.y+0.2, p.position.z);
  const before=c.scatters;
  // simulate a frame where the player is running at 12 m/s
  c.update(0.05, p.position, 12);
  const firedFor0 = b.flee>0;
  const vy=+b.vel.y.toFixed(2);
  // step a few frames to confirm it flies up & away
  const start=b.pos.distanceTo(p.position);
  for(let i=0;i<20;i++) c.update(0.05, p.position, 0);
  const end=b.pos.distanceTo(p.position);
  return { butterflies:c.list.length, scatterDelta:c.scatters-before, fired:firedFor0, burstVy:vy, movedAway:+(end-start).toFixed(2) };
});
console.log('PROBE', JSON.stringify(r), 'errs', errs.length);
await browser.close(); server.close();
