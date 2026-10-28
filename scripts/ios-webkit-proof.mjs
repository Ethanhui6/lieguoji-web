/** Playwright WebKit proof for the iOS shell. Not part of npm run check.
 * Serves the production dist the way Capacitor does (scheme root, no Cloudflare CSP)
 * and also records two negative controls: a sub-path that breaks absolute asset URLs,
 * and a simulated CORS-mode module failure that the on-screen diagnostic must surface.
 * This is not a capacitor:// WKWebView and not a physical iPhone. */
import { webkit, devices } from '@playwright/test';
import { Buffer } from 'node:buffer';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

const dist = path.resolve('dist');
const outDir = process.env.IOS_PROOF_DIR || '/tmp/ios-webkit-proof';
fs.mkdirSync(outDir, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4', '.json': 'application/json' };
const phone = { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, defaultBrowserType: 'webkit' };
const landscape = { ...phone, viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 } };

function fileFor(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === '/broken') return { kind: 'broken' };
  if (clean === '/sub' || clean === '/sub/') return { kind: 'file', file: path.join(dist, 'index.html') };
  const rel = clean.startsWith('/sub/') ? clean.slice(4) : clean;
  const file = path.normalize(path.join(dist, rel === '/' ? 'index.html' : rel));
  if (!file.startsWith(dist + path.sep) && file !== path.join(dist, 'index.html')) return null;
  return { kind: 'file', file };
}

const server = http.createServer((req, res) => {
  const referer = req.headers.referer || '';
  const urlPath = req.url || '/';
  // A document served under /sub/ must not be rescued by root assets. Capacitor
  // itself is the scheme root, so this only shows why base stays "/".
  if (referer.includes('/sub') && !urlPath.startsWith('/sub')) { res.writeHead(404); res.end('subpath'); return; }
  const target = fileFor(urlPath);
  if (!target) { res.writeHead(404); res.end('missing'); return; }
  if (target.kind === 'broken') {
    let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    html = html.replace(/<script type="module"/, '<script type="module" crossorigin');
    html = html.replace(/<link rel="modulepreload"/, '<link rel="modulepreload" crossorigin');
    html = html.replace(/<link rel="stylesheet"/, '<link rel="stylesheet" crossorigin');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
    return;
  }
  if (!fs.existsSync(target.file) || !fs.statSync(target.file).isFile()) { res.writeHead(404); res.end('missing'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(target.file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(target.file).pipe(res);
});

function pngSpread(buffer) {
  let offset = 8, width = 0, height = 0, colorType = 6;
  const idat = [];
  while (offset + 8 < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  let cursor = 0, prev = Buffer.alloc(stride);
  const samples = [];
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    const row = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? row[i - bpp] : 0, up = prev[i], upLeft = i >= bpp ? prev[i - bpp] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, upLeft) : 0;
      row[i] = (row[i] + predictor) & 255;
    }
    prev = row;
    if (y % 24 === 0) for (let x = 0; x < width; x += 24) samples.push([row[x * bpp], row[x * bpp + 1], row[x * bpp + 2]]);
  }
  const unique = new Set(samples.map(pixel => pixel.join(',')));
  return { width, height, samples: samples.length, unique: unique.size };
}

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await webkit.launch();
const report = { base, engine: 'playwright-webkit', device: 'iPhone 13 profile, full-screen viewport', realDevice: false, capacitorScheme: false, cases: [] };

async function shoot(name, contextOptions, url, prepare) {
  const context = await browser.newContext({ ...contextOptions, baseURL: base });
  const page = await context.newPage();
  const failed = [];
  page.on('requestfailed', request => failed.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`));
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  if (prepare) await prepare(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { page, context, failed };
}

try {
  const portrait = await shoot('portrait', phone, '/?fms=1');
  await portrait.page.getByRole('heading', { name: '地图编辑' }).waitFor({ timeout: 30000 });
  const canvas = portrait.page.getByTestId('fms-canvas');
  await canvas.waitFor({ timeout: 30000 });
  // A synthesized touch on this WebKit build crashes the GPU process. A DOM click does not.
  await portrait.page.evaluate(() => document.querySelector('[aria-label="关闭生成地图"]')?.click());
  await portrait.page.waitForTimeout(700);
  const box = await canvas.boundingBox();
  const shot = path.join(outDir, 'iphone-portrait-map.png');
  const buffer = await portrait.page.screenshot({ path: shot });
  const spread = pngSpread(buffer);
  if (!box || box.width < 200 || box.height < 400) throw new Error(`portrait canvas box ${JSON.stringify(box)}`);
  if (spread.unique < 8) throw new Error(`portrait screenshot looks flat (${spread.unique} colors)`);
  report.cases.push({ name: 'portrait-root', url: '/?fms=1', canvas: box, spread, screenshot: shot, failed: portrait.failed });
  await portrait.context.close();

  const land = await shoot('landscape', landscape, '/?fms=1');
  await land.page.getByTestId('fms-canvas').waitFor({ timeout: 30000 });
  await land.page.evaluate(() => document.querySelector('[aria-label="关闭生成地图"]')?.click());
  await land.page.waitForTimeout(700);
  const landShot = path.join(outDir, 'iphone-landscape-map.png');
  const landBuffer = await land.page.screenshot({ path: landShot });
  const landSpread = pngSpread(landBuffer);
  const overflow = await land.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (landSpread.unique < 8) throw new Error(`landscape screenshot looks flat (${landSpread.unique} colors)`);
  if (overflow.scroll > overflow.client + 1) throw new Error(`landscape page overflows ${overflow.scroll}>${overflow.client}`);
  report.cases.push({ name: 'landscape-root', canvas: await land.page.getByTestId('fms-canvas').boundingBox(), spread: landSpread, overflow, screenshot: landShot, failed: land.failed });
  await land.context.close();

  const shell = await shoot('shell', phone, '/?fms=1', page => page.addInitScript(() => { window.__forceIosShell = true; }));
  await shell.page.getByTestId('fms-canvas').waitFor({ timeout: 30000 });
  await shell.page.evaluate(() => document.querySelector('[aria-label="关闭生成地图"]')?.click());
  await shell.page.waitForTimeout(700);
  await shell.page.evaluate(() => {
    document.documentElement.style.setProperty('--sat', '47px');
    document.documentElement.style.setProperty('--sab', '34px');
  });
  const shellMetrics = await shell.page.evaluate(() => {
    const header = document.querySelector('.fms-header').getBoundingClientRect();
    const button = document.querySelector('.fms-toolbar button').getBoundingClientRect();
    const shellOn = document.documentElement.classList.contains('ios-shell');
    const safe = document.defaultView.getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim();
    return { shellOn, safe, headerTop: header.top, button: { width: button.width, height: button.height } };
  });
  if (!shellMetrics.shellOn) throw new Error('ios-shell class missing');
  if (shellMetrics.headerTop < 47) throw new Error(`header top ${shellMetrics.headerTop} ignores the 47px safe area`);
  if (shellMetrics.button.height < 44 || shellMetrics.button.width < 44) throw new Error(`touch target ${JSON.stringify(shellMetrics.button)}`);
  const shellShot = path.join(outDir, 'iphone-safe-area.png');
  await shell.page.screenshot({ path: shellShot });
  report.cases.push({ name: 'safe-area-and-touch', metrics: shellMetrics, screenshot: shellShot, failed: shell.failed });
  await shell.context.close();

  const sub = await shoot('sub', phone, '/sub/?fms=1');
  await sub.page.waitForTimeout(1500);
  const subState = await sub.page.evaluate(() => ({ canvas: !!document.querySelector('canvas'), text: document.body.innerText.slice(0, 80) }));
  report.cases.push({ name: 'subpath-absolute-urls', note: 'Negative control. Capacitor serves at the scheme root, so this is not the installed app. Absolute /assets 404 when the document is under /sub/.', state: subState, failed: sub.failed.slice(0, 12) });
  await sub.context.close();

  const broken = await shoot('broken', phone, '/broken?fms=1', async page => {
    await page.addInitScript(() => { window.__forceIosShell = true; });
    await page.route('**/*', route => {
      const request = route.request();
      const mode = request.headers()['sec-fetch-mode'];
      if (request.resourceType() === 'script' && mode === 'cors') return route.abort('failed');
      return route.continue();
    });
  });
  await broken.page.locator('#boot-diagnostic[data-kind=error]').waitFor({ timeout: 20000 });
  const diagnostic = await broken.page.locator('#boot-diagnostic').innerText();
  if (!diagnostic.includes('模块脚本没有执行') && !diagnostic.includes('地图没有显示')) throw new Error(diagnostic);
  const brokenShot = path.join(outDir, 'iphone-diagnostic.png');
  await broken.page.screenshot({ path: brokenShot });
  const stillNoCanvas = await broken.page.evaluate(() => !document.querySelector('canvas'));
  report.cases.push({ name: 'simulated-cors-module-block', note: 'Playwright cannot host capacitor://. This aborts CORS-mode script loads, which is the failure mode WebKit applies to crossorigin module tags on that scheme. The classic diagnostic stays on screen.', diagnostic: diagnostic.split('\n').slice(0, 8), stillNoCanvas, screenshot: brokenShot });
  await broken.context.close();
} finally {
  await browser.close();
  server.close();
}

const summary = path.join(outDir, 'report.json');
fs.writeFileSync(summary, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
