import { test as base, chromium, type BrowserContext } from "@playwright/test";

/**
 * MV3 extensions only load in a persistent (non-incognito) context. The test
 * runner's default `context` fixture is ephemeral, so this fixture launches its
 * own persistent context, reusing the launch options from playwright.config.ts
 * (single source of truth for headless/channel/args).
 */
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // oxlint-disable-next-line eslint/no-empty-pattern -- Playwright fixture factories require the (deps, use, testInfo) signature; deps is destructured even when the fixture takes no dependencies
  context: async ({}, use, testInfo) => {
    const { headless, channel, launchOptions } = testInfo.project.use;
    const context = await chromium.launchPersistentContext("", {
      headless,
      channel,
      ...launchOptions,
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker");
    // Deterministic per dist path — always derived at runtime, never hardcoded.
    const extensionId = new URL(serviceWorker.url()).host;
    await use(extensionId);
  },
});

export const expect = test.expect;
