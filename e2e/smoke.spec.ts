import { test, expect } from "./fixtures";
import fs from "node:fs";
import path from "node:path";

// The test:e2e script runs `npm run build` before `playwright test`, so dist/
// is guaranteed to exist here. Must be absolute for --load-extension.
const DIST = path.resolve(process.cwd(), "dist");

test("extension loads, service worker registers, popup renders, zero console errors", async ({
  context,
  extensionId,
}) => {
  const errors: string[] = [];
  const recordError = (msg: string) => errors.push(msg);

  // (a) The MV3 service worker must be registered for the loaded extension.
  const worker = context.serviceWorkers()[0];
  expect(worker, "extension service worker is registered").toBeTruthy();
  worker.on("console", (msg) => {
    if (msg.type() === "error") recordError(msg.text());
  });

  // (b) Popup opens and renders content; extension id comes from the worker URL.
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, "manifest.json"), "utf8")) as {
    action?: { default_popup?: string };
  };
  const popupPath = manifest.action?.default_popup ?? "popup.html";

  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") recordError(msg.text());
  });
  await page.goto(`chrome-extension://${extensionId}/${popupPath}`);
  await page.waitForLoadState("domcontentloaded");

  // The page title is JS-driven and renders empty on a bare page — assert on
  // rendered content/UI presence instead.
  await expect(page.locator(".logo")).toContainText("gTabs-DELIBERATE-FAIL-PROBE");
  await expect(page.locator("#organize")).toContainText("Organize All");

  expect(errors, "no console errors on page or service worker").toEqual([]);
});
