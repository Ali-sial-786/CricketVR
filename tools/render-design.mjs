// Screenshots tools/design-sheet.html to hardware/bat-handle/renders/design-sheet.png.
// Needs: `npm run export-stl` first (for the stand-in meshes) and Playwright
// with Chromium (`npm i -g playwright && npx playwright install chromium`).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'hardware/bat-handle/renders/design-sheet.png');

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return createRequire(join(globalRoot, 'noop.js'))('playwright');
  }
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.stl': 'model/stl', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1120 }, deviceScaleFactor: Number(process.env.SCALE || 2) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://127.0.0.1:${port}/tools/design-sheet.html`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(300);
await page.locator('#sheet').screenshot({ path: process.env.OUT || out });
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`wrote ${(process.env.OUT || out).replace(root + '/', '')}`);
