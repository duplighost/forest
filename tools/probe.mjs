import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT='/home/user/forest/dist';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const fp=normalize(join(ROOT,p));if(!fp.startsWith(ROOT)){res.writeHead(403);return res.end();}const d=await readFile(fp);res.writeHead(200,{'Content-Type':MIME[extname(fp)]||'application/octet-stream'});res.end(d);}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(8079,r));
function findChrome(){const root='/opt/pw-browsers';for(const d of readdirSync(root).filter(d=>d.startsWith('chromium')))for(const c of[`${root}/${d}/chrome-linux/chrome`,`${root}/${d}/chrome-linux/headless_shell`])if(existsSync(c))return c;}
const browser=await chromium.launch({executablePath:findChrome(),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:900,height:600}});
const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:8079/#hollow',{waitUntil:'load',timeout:40000});
await page.mouse.click(450,300);
await page.waitForTimeout(5000);
const r=await page.evaluate(()=>{
  const g=window.__GAME;
  const giants=g.world.activeTrees.filter(t=>t.giant).length;
  // dandelion: count live FX particles, fire a puff, recount
  const fxAlive=()=>{let n=0;const L=g.engine?0:0;return n;};
  // force a dandelion burst and check the FX buffer grows
  const fx=g.world; // not exposed; use squirrel scene? skip
  return {
    giantsLoaded: giants,
    cozyVisible: g.hollow.group.visible,
    hollowGlow: +g.hollow._glow.toFixed(2),
    hollowStruct: +g.hollow._struct.toFixed(2),
    cozyOpacity: document.getElementById('cozy').style.opacity,
    state: g.player.state, speed:+g.player.speed.toFixed(2),
  };
});
console.log('PROBE',JSON.stringify(r),'errs',errs.length);
await browser.close();server.close();
