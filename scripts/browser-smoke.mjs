// Optional: supply Playwright separately. Not a runtime dependency.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url)), out = `${root}/artifacts`; await mkdir(out, { recursive: true });
const server = spawn(process.execPath, [`${root}/scripts/dev.mjs`, '--port', '8093'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Server exited: ${code}`))); });
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1120 }, deviceScaleFactor: 1 }), pageErrors = [], external = [];
  page.on('pageerror', error => pageErrors.push(error.message)); page.on('request', req => { if (/^https?:/.test(req.url()) && !req.url().startsWith('http://127.0.0.1:8093/')) external.push(req.url()); });
  const ready = () => page.waitForFunction(() => document.querySelector('#art').dataset.ready === 'true', null, { timeout: 120000 });
  const change = async (id, value) => { await page.evaluate(({ id, value }) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, { id, value }); await page.waitForFunction(() => document.querySelector('#art').dataset.ready === 'false'); await ready(); };
  const started = Date.now(); await page.goto('http://127.0.0.1:8093/'); await ready(); const readyMs = Date.now() - started;
  assert.equal(await page.locator('#count-submissions').textContent(), '947');
  const art = await page.locator('#art').evaluate(c => c.toDataURL('image/jpeg', .92)); await writeFile(`${out}/preview.jpg`, Buffer.from(art.split(',')[1], 'base64'));
  await page.screenshot({ path: `${out}/studio-desktop.png`, fullPage: true }); console.log(`Initial render: ${readyMs} ms`);
  await page.locator('#history-file').setInputFiles(`${root}/examples/history-small.json`); await page.waitForFunction(() => document.querySelector('#count-submissions').textContent === '3'); await ready();
  await change('through', 0); assert.equal(await page.locator('#count-submissions').textContent(), '1'); assert.equal(await page.locator('#count-clinics').textContent(), '1');
  await change('through', 1); assert.equal(await page.locator('#count-submissions').textContent(), '3');
  await page.locator('#history-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"patientName":"forbidden"}') }); await page.locator('#error').waitFor({ state: 'visible' }); assert.equal(await page.locator('#count-submissions').textContent(), '3');
  await change('glow', 0); const before = await page.locator('#art').evaluate(c => c.toDataURL());
  const projectEvent = page.waitForEvent('download'); await page.locator('#save-project').click(); const projectDownload = await projectEvent; await projectDownload.saveAs(`${out}/project.json`);
  await page.locator('#reseed').click(); await page.waitForFunction(() => document.querySelector('#art').dataset.ready === 'false'); await ready(); assert.notEqual(await page.locator('#art').evaluate(c => c.toDataURL()), before);
  await page.locator('#history-file').setInputFiles(`${out}/project.json`); await page.waitForFunction(() => document.querySelector('#seed').value === 'VITL-2026'); await page.waitForFunction(() => document.querySelector('#art').dataset.ready === 'false'); await ready(); assert.equal(await page.locator('#art').evaluate(c => c.toDataURL()), before);
  const legacyProject = JSON.parse(await readFile(`${out}/project.json`, 'utf8')); legacyProject.rendererVersion = '1.0.0'; delete legacyProject.settings.rendererVersion; legacyProject.settings.seed = 'legacy-study';
  await page.locator('#history-file').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacyProject)) });
  await page.waitForFunction(() => document.querySelector('#seed').value === 'legacy-study'); await ready();
  assert.ok((await page.locator('#status').textContent()).includes('Original flow retained'));
  assert.equal(await page.evaluate(async saved => {
    const { validateHistory } = await import('/src/journey/data.mjs'), { buildScene } = await import('/src/journey/scene-v1.mjs'), { renderScene } = await import('/src/journey/render.mjs');
    // Match the worker's OffscreenCanvas -> ImageBitmap compositing path.
    const actual = document.querySelector('#art'), output = new OffscreenCanvas(actual.width, actual.height);
    renderScene(output, buildScene(validateHistory(saved.history), { ...saved.settings, rendererVersion: '1.0.0' }));
    const expected = document.createElement('canvas'); expected.width = actual.width; expected.height = actual.height;
    const bitmap = output.transferToImageBitmap(); expected.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
    return actual.toDataURL() === expected.toDataURL();
  }, legacyProject), true);
  await page.locator('#reset-style').click(); await page.waitForFunction(() => document.querySelector('#art').dataset.ready === 'false'); await ready();
  assert.ok(!(await page.locator('#status').textContent()).includes('Original flow retained'));
  await page.locator('#export-size').selectOption('2048'); const pngEvent = page.waitForEvent('download', { timeout: 120000 }); await page.locator('#export').click(); const pngDownload = await pngEvent; await pngDownload.saveAs(`${out}/export-2048.png`);
  const png = await readFile(`${out}/export-2048.png`); assert.equal(png.readUInt32BE(16), 2048); assert.equal(png.readUInt32BE(20), 2048); assert.equal(png.readUInt32BE(png.indexOf('pHYs') + 4), 11811);
  await page.locator('#reset-data').click(); await page.waitForFunction(() => document.querySelector('#count-submissions').textContent === '947'); await ready();
  await page.locator('#reset-style').click(); await page.waitForFunction(() => document.querySelector('#art').dataset.ready === 'false'); await ready();
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false); await page.screenshot({ path: `${out}/studio-mobile.png`, fullPage: true });
  await page.locator('#view-art').click(); assert.equal(await page.locator('body').getAttribute('class'), 'focus'); await page.keyboard.press('Escape'); assert.equal(await page.locator('body').getAttribute('class'), ''); await page.setViewportSize({ width: 1440, height: 1120 });
  if (process.env.TEST_PRINT === '1') {
    await page.locator('#export-size').selectOption('7200'); const printStart = Date.now(), printEvent = page.waitForEvent('download', { timeout: 180000 }); await page.locator('#export').click(); const print = await printEvent; await print.saveAs(`${out}/export-7200.png`);
    const bytes = await readFile(`${out}/export-7200.png`); assert.equal(bytes.readUInt32BE(16), 7200); assert.equal(bytes.readUInt32BE(20), 7200); console.log(`7200px export: ${Date.now() - printStart} ms; ${bytes.length} bytes`);
  }
  const fallback = await browser.newPage({ viewport: { width: 1000, height: 900 } }); await fallback.addInitScript(() => { window.Worker = undefined; }); fallback.on('pageerror', error => pageErrors.push(error.message)); await fallback.goto('http://127.0.0.1:8093/'); await fallback.waitForFunction(() => document.querySelector('#art').dataset.ready === 'true', null, { timeout: 120000 }); assert.equal(await fallback.locator('#count-submissions').textContent(), '947'); await fallback.close();
  assert.deepEqual(pageErrors, []); assert.deepEqual(external, []);
  const report = { browser: browser.version(), readyMs, submissions: 947, cases: ['worker render', 'import', 'invalid import preserves study', 'timeline cutoff', 'seed changes canvas', 'project reproduces canvas', 'legacy project reproduces original renderer', 'reset style upgrades legacy flow', '2048px export and 300dpi metadata', 'mobile no overflow', 'focus view', 'main-thread fallback', ...(process.env.TEST_PRINT === '1' ? ['7200px print export'] : [])], errors: pageErrors, externalRequests: external };
  await writeFile(`${out}/browser-report.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); server.kill(); }
