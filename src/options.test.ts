import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { resetAllMocks } from "../vitest.setup";
import { DEFAULT_SETTINGS, type Stats } from "./types";
// NOTE: `./storage` is imported dynamically inside each test, after `vi.resetModules()`,
// so spies target the same module instance that `./options` uses after its re-import.

const html = readFileSync(resolve(__dirname, "./options.html"), "utf-8");

describe("Options Page", () => {
  beforeEach(() => {
    document.body.innerHTML = html;
    resetAllMocks();
    vi.clearAllMocks();
    // Each test re-executes ./options against fresh DOM; without this, the module is
    // cached and the init script never re-runs, leaving listeners on dead elements.
    vi.resetModules();

    // Reset chrome.runtime.sendMessage
    let testConnectionCallCount = 0;
    (chrome.runtime.sendMessage as any).mockImplementation((msg: any, cb: Function) => {
      if (msg.type === "check-chrome-ai") cb({ available: true });
      else if (msg.type === "fetch-ollama-models") cb({ models: ["llama2", "mistral"] });
      else if (msg.type === "get-stats")
        cb({
          stats: { totalOrganizations: 10, totalTabsGrouped: 50, lastOrganizedAt: Date.now() },
        });
      else if (msg.type === "get-costs")
        cb({
          costs: {
            byProvider: { openai: { inputTokens: 10, outputTokens: 20, cost: 0.05 } },
            totalInputTokens: 10,
            totalOutputTokens: 20,
            totalCost: 0.05,
          },
        });
      else if (msg.type === "test-connection") {
        testConnectionCallCount += 1;
        cb(
          testConnectionCallCount === 1 ? { status: "done" } : { status: "error", error: "Failed" },
        );
      } else if (msg.type === "export-data") cb({ data: { test: 1 } });
      else if (msg.type === "import-data") cb({ status: "imported" });
      else cb({ status: "done" });
    });
  });

  it("loads and initializes the page with default settings", async () => {
    const storage = await import("./storage");
    vi.spyOn(storage, "getSettings").mockResolvedValue(DEFAULT_SETTINGS);
    vi.spyOn(storage, "getDomainRules").mockResolvedValue([]);
    const saveSpy = vi.spyOn(storage, "saveSettings").mockResolvedValue();
    const saveRulesSpy = vi.spyOn(storage, "saveDomainRules").mockResolvedValue();

    // Dynamically import to run the init script
    await import("./options");
    for (let i = 0; i < 15; i++) await new Promise((r) => process.nextTick(r));

    // Test Provider Selection
    const providerGrid = document.getElementById("provider-grid");
    expect(providerGrid?.children.length).toBeGreaterThan(0);
    // Click the last provider (Ollama) and confirm the selection updates
    (providerGrid!.lastElementChild as HTMLElement).click();
    for (let i = 0; i < 5; i++) await new Promise((r) => process.nextTick(r));
    expect(providerGrid!.querySelector(".provider-card.selected .name")?.textContent).toBe(
      "Ollama (Local)",
    );

    // Click a hosted provider and verify API key UI is shown
    (providerGrid!.children[1] as HTMLElement).click();
    expect(
      (document.getElementById("key-row") as HTMLElement).classList.contains("hidden"),
    ).toBeFalsy();

    // Test range bindings and auto-save
    const maxGroups = document.getElementById("maxGroups") as HTMLInputElement;
    maxGroups.value = "10";
    maxGroups.dispatchEvent(new Event("input"));
    maxGroups.dispatchEvent(new Event("change"));
    expect(document.getElementById("maxGroupsVal")?.textContent).toBe("10");
    expect(saveSpy).toHaveBeenCalled();

    // Test Connection Button
    const testBtn = document.getElementById("test-btn") as HTMLButtonElement;
    testBtn.click();
    for (let i = 0; i < 5; i++) await new Promise((r) => process.nextTick(r));
    expect(document.getElementById("test-result")?.textContent).toBe("Connected!");

    // Test Connection Button Error
    (chrome.runtime.sendMessage as any).mockImplementationOnce((msg: any, cb: Function) =>
      cb({ status: "error", error: "Failed" }),
    );
    testBtn.click();
    for (let i = 0; i < 5; i++) await new Promise((r) => process.nextTick(r));
    expect(document.getElementById("test-result")?.textContent).toBe("Failed");

    // Test adding a domain rule
    const btnAddRule = document.getElementById("add-rule") as HTMLButtonElement;
    btnAddRule.click();
    for (let i = 0; i < 5; i++) await new Promise((r) => process.nextTick(r));
    expect(saveRulesSpy).toHaveBeenCalled();
    const ruleInput = document.querySelector(".rule-domain") as HTMLInputElement;
    expect(ruleInput).toBeTruthy();

    // Test rule edit
    ruleInput.value = "github.com";
    ruleInput.dispatchEvent(new Event("change"));
    expect(saveRulesSpy).toHaveBeenCalled();

    // Test rule delete
    const delRule = document.querySelector(".rule-delete") as HTMLButtonElement;
    delRule.click();
    for (let i = 0; i < 5; i++) await new Promise((r) => process.nextTick(r));
    expect(document.querySelector(".rule-domain")).toBeFalsy();

    // Test Export
    global.URL.createObjectURL = vi
      .fn<(blob: Blob | MediaSource) => string>()
      .mockReturnValue("blob:test");
    const exportBtn = document.getElementById("export-data") as HTMLButtonElement;
    exportBtn.click();
    for (let i = 0; i < 5; i++) await new Promise((r) => process.nextTick(r));

    // Test Import
    const importBtn = document.getElementById("import-data") as HTMLButtonElement;
    const importFile = document.getElementById("import-file") as HTMLInputElement;
    importBtn.click(); // does importFile.click()

    // Mock files array
    Object.defineProperty(importFile, "files", {
      value: [new File([JSON.stringify({ settings: DEFAULT_SETTINGS })], "export.json")],
    });
    importFile.dispatchEvent(new Event("change"));
    for (let i = 0; i < 5; i++) await new Promise((r) => process.nextTick(r));
  });

  it("reloads settings after a successful import", async () => {
    const storage = await import("./storage");
    vi.spyOn(storage, "getDomainRules").mockResolvedValue([]);
    vi.spyOn(storage, "saveSettings").mockResolvedValue();
    vi.spyOn(storage, "saveDomainRules").mockResolvedValue();
    // Page init reads DEFAULT_SETTINGS; the import reload (success path) reads these.
    const getSettingsSpy = vi
      .spyOn(storage, "getSettings")
      .mockResolvedValueOnce(DEFAULT_SETTINGS)
      .mockResolvedValue({ ...DEFAULT_SETTINGS, maxGroups: 12 });

    await import("./options");
    for (let i = 0; i < 15; i++) await new Promise((r) => process.nextTick(r));

    // Init rendered the defaults.
    expect((document.getElementById("maxGroups") as HTMLInputElement).value).toBe(
      String(DEFAULT_SETTINGS.maxGroups),
    );

    const importFile = document.getElementById("import-file") as HTMLInputElement;
    Object.defineProperty(importFile, "files", {
      value: [new File([JSON.stringify({ settings: DEFAULT_SETTINGS })], "export.json")],
    });
    importFile.dispatchEvent(new Event("change"));
    for (let i = 0; i < 15; i++) await new Promise((r) => process.nextTick(r));

    // import-data resolved {status:"imported"}, so the success path re-ran load(),
    // which re-reads settings and re-rendered them from the reloaded value (in-range
    // for the maxGroups range input, which clamps out-of-range values).
    expect(getSettingsSpy).toHaveBeenCalledTimes(2);
    expect((document.getElementById("maxGroups") as HTMLInputElement).value).toBe("12");
    expect((document.getElementById("maxGroupsVal") as HTMLElement).textContent).toBe("12");
  });

  it("alerts with the error message when import fails", async () => {
    const storage = await import("./storage");
    vi.spyOn(storage, "getSettings").mockResolvedValue(DEFAULT_SETTINGS);
    vi.spyOn(storage, "getDomainRules").mockResolvedValue([]);
    // The spy both asserts the dialog and silences jsdom's "Not implemented: alert" stub.
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    await import("./options");
    for (let i = 0; i < 15; i++) await new Promise((r) => process.nextTick(r));

    (chrome.runtime.sendMessage as any).mockImplementationOnce((msg: any, cb: Function) => {
      if (msg.type === "import-data") cb({ status: "error", error: "Import failed" });
    });

    const importFile = document.getElementById("import-file") as HTMLInputElement;
    Object.defineProperty(importFile, "files", {
      value: [new File([JSON.stringify({ bad: true })], "export.json")],
    });
    importFile.dispatchEvent(new Event("change"));
    for (let i = 0; i < 15; i++) await new Promise((r) => process.nextTick(r));

    // Handler saw {status:"error"} !== "imported" and alerted the error message.
    expect(alertSpy).toHaveBeenCalledWith("Import failed");
  });
});

describe("formatStatsLine", () => {
  // `formatStatsLine` is a pure module-scope helper in ./storage, importable
  // without any options-page (DOM) side effects.
  let formatStatsLine: (s: Stats) => string;
  beforeEach(async () => {
    document.body.innerHTML = html;
    resetAllMocks();
    vi.resetModules();
    formatStatsLine = (await import("./storage")).formatStatsLine;
  });

  it("labels populated stats as totals with formatted (thousands-separated) counts", () => {
    const timestamp = new Date(2026, 3, 15).getTime(); // 4/15/2026
    const stats: Stats = {
      totalOrganizations: 24,
      totalTabsGrouped: 1400,
      lastOrganizedAt: timestamp,
    };
    // The formatter returns markup; assert the text a user actually sees.
    const el = document.createElement("div");
    el.innerHTML = formatStatsLine(stats);
    expect(el.textContent).toBe(
      `24 total organizes · 1,400 total tabs grouped · Last: ${new Date(
        timestamp,
      ).toLocaleDateString()}`,
    );
    expect(formatStatsLine(stats)).toContain("total");
  });

  it("renders the never-organized empty state instead of omitting the section", () => {
    const stats: Stats = {
      totalOrganizations: 0,
      totalTabsGrouped: 0,
      lastOrganizedAt: null,
    };
    const el = document.createElement("div");
    el.innerHTML = formatStatsLine(stats);
    expect(el.textContent).toBe("0 total organizes · 0 total tabs grouped · Last: never");
  });
});
