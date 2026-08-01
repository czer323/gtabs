import { vi } from "vitest";

let localStore: Record<string, unknown> = {};
let syncStore: Record<string, unknown> = {};

function makeStorage(store: Record<string, unknown>) {
  return {
    get: vi.fn((keys?: string | string[] | Record<string, unknown> | null) => {
      if (!keys) return Promise.resolve({ ...store });
      if (typeof keys === "string") return Promise.resolve({ [keys]: store[keys] });
      if (Array.isArray(keys)) {
        const r: Record<string, unknown> = {};
        for (const k of keys) if (k in store) r[k] = store[k];
        return Promise.resolve(r);
      }
      const r: Record<string, unknown> = {};
      for (const [k, def] of Object.entries(keys)) r[k] = k in store ? store[k] : def;
      return Promise.resolve(r);
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    }),
  };
}

class MockEvent {
  listeners = new Set<Function>();
  addListener = vi.fn((cb: Function) => this.listeners.add(cb));
  removeListener = vi.fn((cb: Function) => this.listeners.delete(cb));
  callListeners(...args: any[]) {
    return Promise.all(Array.from(this.listeners).map((cb) => cb(...args)));
  }
}

export function resetStores() {
  localStore = {};
  syncStore = {};
  (globalThis as any).chrome.storage.local = makeStorage(localStore);
  (globalThis as any).chrome.storage.sync = makeStorage(syncStore);
}

export function resetAllMocks() {
  resetStores();
  groupIdCounter = 100;
  vi.mocked(chrome.tabs.query as any)
    .mockReset()
    .mockResolvedValue([]);
  vi.mocked(chrome.tabs.group as any)
    .mockReset()
    .mockResolvedValue(100);
  vi.mocked(chrome.tabs.ungroup as any)
    .mockReset()
    .mockResolvedValue(undefined);
  vi.mocked(chrome.tabs.create as any)
    .mockReset()
    .mockImplementation(
      async (createProperties: any) =>
        ({
          id: groupIdCounter++,
          windowId: createProperties.windowId ?? 1,
          url: createProperties.url,
          title: createProperties.url || "",
          active: Boolean(createProperties.active),
          pinned: Boolean(createProperties.pinned),
          index: 0,
          groupId: -1,
        }) as any,
    );
  vi.mocked(chrome.tabs.move as any)
    .mockReset()
    .mockResolvedValue([] as any);
  vi.mocked(chrome.tabs.update as any)
    .mockReset()
    .mockImplementation(async (tabId: number, updateProperties: any) => ({
      id: tabId,
      ...updateProperties,
    }));
  vi.mocked(chrome.tabs.discard as any)
    .mockReset()
    .mockResolvedValue(undefined as any);
  vi.mocked(chrome.tabs.remove as any)
    .mockReset()
    .mockResolvedValue(undefined as any);
  vi.mocked(chrome.tabs.get as any)
    .mockReset()
    .mockImplementation(
      async (tabId: number) =>
        ({
          id: tabId,
          groupId: -1,
          windowId: 1,
        }) as any,
    );
  vi.mocked(chrome.tabGroups.query as any)
    .mockReset()
    .mockResolvedValue([]);
  vi.mocked(chrome.tabGroups.update as any)
    .mockReset()
    .mockResolvedValue(undefined as any);
  vi.mocked(chrome.windows.getCurrent as any)
    .mockReset()
    .mockResolvedValue({ id: 1 } as any);
  vi.mocked(chrome.windows.getLastFocused as any)
    .mockReset()
    .mockResolvedValue({ id: 1 } as any);
  vi.mocked(chrome.windows.getAll as any)
    .mockReset()
    .mockResolvedValue([{ id: 1, tabs: [] }] as any);
  vi.mocked(chrome.windows.create as any)
    .mockReset()
    .mockResolvedValue({ id: 2 } as any);
  vi.mocked(chrome.contextMenus.create as any)
    .mockReset()
    .mockImplementation((_props: any, callback?: () => void) => {
      callback?.();
    });
  vi.mocked(chrome.contextMenus.remove as any)
    .mockReset()
    .mockImplementation((_menuItemId: any, callback?: () => void) => {
      callback?.();
      return Promise.resolve(undefined as any) as any;
    });
  vi.mocked(chrome.contextMenus.removeAll as any)
    .mockReset()
    .mockImplementation((callback?: () => void) => {
      callback?.();
      return Promise.resolve(undefined as any) as any;
    });
  vi.mocked(chrome.bookmarks.create as any)
    .mockReset()
    .mockImplementation(async (bookmark: any) => ({
      id: String(groupIdCounter++),
      ...bookmark,
    }));
  vi.mocked(chrome.action.setBadgeText as any)
    .mockReset()
    .mockResolvedValue(undefined);
  vi.mocked(chrome.action.setBadgeBackgroundColor as any)
    .mockReset()
    .mockResolvedValue(undefined);
  vi.mocked(chrome.runtime.openOptionsPage as any)
    .mockReset()
    .mockResolvedValue(undefined as any);
  vi.mocked(fetch).mockReset();
}

let groupIdCounter = 100;

(globalThis as any).chrome = {
  tabs: {
    query: vi.fn(() => Promise.resolve([])),
    group: vi.fn(() => Promise.resolve(groupIdCounter++)),
    ungroup: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    move: vi.fn(() => Promise.resolve()),
    discard: vi.fn(() => Promise.resolve()),
    create: vi.fn(() => Promise.resolve()),
    onCreated: new MockEvent(),
    onRemoved: new MockEvent(),
    onUpdated: new MockEvent(),
    onActivated: new MockEvent(),
    get: vi.fn((tabId: number) => Promise.resolve({ id: tabId, groupId: -1 })),
  },
  tabGroups: {
    query: vi.fn(() => Promise.resolve([])),
    update: vi.fn(() => Promise.resolve()),
    onCreated: new MockEvent(),
    onRemoved: new MockEvent(),
    onUpdated: new MockEvent(),
  },
  windows: {
    WINDOW_ID_CURRENT: -2,
    getAll: vi.fn(() => Promise.resolve([])),
    getCurrent: vi.fn(() => Promise.resolve({ id: 1 })),
    getLastFocused: vi.fn(() => Promise.resolve({ id: 1 })),
    create: vi.fn(() => Promise.resolve({ id: 2 })),
    update: vi.fn(() => Promise.resolve()),
  },
  scripting: {
    executeScript: vi.fn(() => Promise.resolve([])),
  },
  bookmarks: {
    create: vi.fn(() => Promise.resolve({ id: "123" })),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: new MockEvent(),
  },
  runtime: {
    onMessage: new MockEvent(),
    onInstalled: new MockEvent(),
    lastError: undefined,
    sendMessage: vi.fn(),
    openOptionsPage: vi.fn(() => Promise.resolve()),
  },
  commands: {
    onCommand: new MockEvent(),
  },
  contextMenus: {
    create: vi.fn((_props: any, callback?: () => void) => callback?.()),
    remove: vi.fn((_menuItemId: any, callback?: () => void) => {
      callback?.();
      return Promise.resolve();
    }),
    removeAll: vi.fn((callback?: () => void) => {
      callback?.();
      return Promise.resolve();
    }),
    onClicked: new MockEvent(),
  },
  storage: {
    local: makeStorage(localStore),
    sync: makeStorage(syncStore),
    onChanged: new MockEvent(),
  },
  action: {
    setBadgeText: vi.fn(() => Promise.resolve()),
    setBadgeBackgroundColor: vi.fn(() => Promise.resolve()),
  },
};

(globalThis as any).navigator = Object.assign(globalThis.navigator, {
  clipboard: { writeText: vi.fn(() => Promise.resolve()) },
});

(globalThis as any).fetch = vi.fn();

// --- jsdomError warnings policy ---
// jsdom implements a handful of APIs as stubs that emit `jsdomError` events
// ("Not implemented: ...") instead of doing real work. Vitest 4's jsdom environment
// passes no virtual console, so jsdom's default virtual console forwards every
// jsdomError to stderr. Two of those stubs are exercised on purpose by this suite:
//   - window.alert()  — import feedback in src/options.ts (and CSV-rule feedback)
//   - navigation     — the export download anchor click (jsdom cannot navigate)
// They are deliberate no-ops in jsdom and produce known-good output in Chrome, so
// allowlist them here to keep them quiet. EVERY other jsdomError still prints: a
// new/unexpected "Not implemented" line is a tripwire that a test now relies on an
// unimplemented API and should be audited. See src/options.test.ts for the
// window.alert spy, which silences the alert stub at its source in the failure test.
const KNOWN_BENIGN_JSDOM_ERRORS = new Set([
  "Not implemented: Window's alert() method",
  "Not implemented: navigation to another Document",
]);

interface JsdomError {
  message: string;
  type?: string;
  cause?: { stack?: string };
}

interface JsdomVirtualConsole {
  removeAllListeners(event: string): unknown;
  on(event: "jsdomError", listener: (error: JsdomError) => void): unknown;
}

function applyJsdomWarningsPolicy(): void {
  // The vitest jsdom environment exposes the JSDOM instance on the global; its
  // public `virtualConsole` is the default one jsdom created (forwarding every
  // jsdomError to console.error). Swap its jsdomError handler for the filtered one.
  const virtualConsole = (globalThis as { jsdom?: { virtualConsole?: JsdomVirtualConsole } }).jsdom
    ?.virtualConsole;
  if (!virtualConsole) return;
  virtualConsole.removeAllListeners("jsdomError");
  virtualConsole.on("jsdomError", (error) => {
    if (KNOWN_BENIGN_JSDOM_ERRORS.has(error.message)) return;
    // Mirror jsdom's default forwarding (lib/jsdom/virtual-console.js): write to
    // raw stderr, bypassing vitest's console interception, so unexpected
    // jsdomErrors stay visible even under the default (dot) reporter.
    const line =
      error.type === "unhandled-exception" ? (error.cause?.stack ?? error.message) : error.message;
    process.stderr.write(`${line}\n`);
  });
}
applyJsdomWarningsPolicy();
