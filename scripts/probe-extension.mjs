#!/usr/bin/env node
/**
 * Card #67 spike probe: can Chromium on THIS host load the unpacked gTabs
 * extension (dist/) and reach its service worker?
 *
 * Usage:
 *   node scripts/probe-extension.mjs            # headless
 *   node scripts/probe-extension.mjs headed     # headed (run under xvfb-run)
 *
 * Discovery probe only — no merge, no extension behavior testing.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Absolute path to dist/ — required for --load-extension.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const HEADED = process.argv[2] === 'headed';
const NEWHEADLESS = process.argv[2] === 'newheadless';

function fail(msg) {
  console.error(`\n[RESULT] FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  console.log('[CARD67] dist path      :', DIST);
  console.log('[CARD67] mode         :', HEADED ? 'headed' : NEWHEADLESS ? 'new-headless' : 'headless-shell');
  console.log('[CARD67] playwright     :', (await import('@playwright/test/package.json', { with: { type: 'json' } })).default?.version ?? 'n/a');
  console.log('[CARD67] chromium exec  :', chromium.executablePath());

  // Persistent context — required for MV3 extension support; flags from the
  // Playwright "extensions" example. Chrome strips these unless the context is
  // non-incognito / persistent.
  const ctx = await chromium.launchPersistentContext('', {
    // headless-shell (default) drops extensions; use full chromium in its
    // "new headless" mode via channel when probing NEWHEADLESS.
    headless: !HEADED,
    channel: NEWHEADLESS ? 'chromium' : undefined,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--no-sandbox',
    ],
    // A profile dir is required for extensions to stick; empty string above is
    // a temp profile. Extensions also require a non-incognito context.
  });

  console.log('[CARD67] context launched');

  // (a) Reach the extension service worker.
  let workers = ctx.serviceWorkers();
  console.log('[CARD67] serviceWorkers() count:', workers.length);
  for (const w of workers) console.log('  - worker url:', w.url());

  let sw = workers.find((w) => w.url().startsWith('chrome-extension://'));
  if (!sw) {
    // SW may register lazily; give it a moment.
    await new Promise((r) => setTimeout(r, 1500));
    workers = ctx.serviceWorkers();
    sw = workers.find((w) => w.url().startsWith('chrome-extension://'));
  }

  if (!sw) {
    await ctx.close();
    fail('no extension service worker appeared (chrome-extension://)');
  }
  console.log('[ok] extension SW found:', sw.url());
  const extId = new URL(sw.url()).host;
  console.log('[ok] extension id      :', extId);

  // Derive the popup URL from the manifest on disk (avoids SW fetch serialization).
  const fs = await import('node:fs');
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
  const popupPath = manifest.action?.default_popup ?? 'popup.html';
  const popupUrl = `chrome-extension://${extId}/${popupPath}`;
  console.log('[ok] popup URL         :', popupUrl);

  // (b) Open the popup page itself.
  const popupPage = await ctx.newPage();
  await popupPage.goto(popupUrl);
  await popupPage.waitForTimeout(300);
  console.log('[ok] popup.html opened, title:', await popupPage.title().catch(() => '<none>'));

  // (c) Queries inside the SW: the E2E engine-state access we rely on.
  try {
    const tabs = await sw.evaluate(() => chrome.tabs.query({}));
    console.log('[ok] chrome.tabs.query({}) from SW returned', tabs.length, 'tab(s)');
  } catch (err) {
    await ctx.close();
    fail(`chrome.tabs.query({}) from SW threw: ${err}`);
  }

  await ctx.close();
  console.log('\n[RESULT] PASS — extension SW reachable, chrome.tabs accessible');
}

main().catch((err) => {
  console.error('\n[RESULT] FATAL:');
  console.error(err?.stack ?? err);
  process.exit(1);
});