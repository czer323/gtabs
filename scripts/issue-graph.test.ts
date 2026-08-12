import { afterAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildGraph,
  classify,
  dependsOnRefs,
  drift,
  loadIssues,
  payout,
  type Issue,
} from "./issue-graph.ts";

const REPO_ROOT = join(import.meta.dirname, "..");
const SCRIPT_PATH = join(import.meta.dirname, "issue-graph.ts");

type FixtureIssue = { number: number; title: string; blockedBy: number[] };

// Fake `gh` shim placed first on PATH so CLI tests never touch a real gh binary.
// Responds to `gh issue list --state open --json number,title` and
// `gh issue view N --json blockedBy,blocking,title` from a fixture file.
const FAKE_GH = [
  "#!/usr/bin/env node",
  'const fs = require("node:fs");',
  'const fixture = JSON.parse(fs.readFileSync(process.env.GTABS_FAKE_GH_FIXTURE, "utf8"));',
  "const sub = process.argv[3];", // argv: [node, gh, "issue", sub, ...]
  'if (sub === "list") {',
  "  process.stdout.write(JSON.stringify(fixture.map((i) => ({ number: i.number, title: i.title }))));",
  '} else if (sub === "view") {',
  "  const n = Number(process.argv[4]);",
  "  const issue = fixture.find((i) => i.number === n);",
  '  if (!issue) { console.error("fake gh: issue " + n + " not found"); process.exit(1); }',
  "  const blockedBy = (issue.blockedBy ?? []).map((b) => ({ number: b }));",
  "  process.stdout.write(JSON.stringify({ title: issue.title, blockedBy: blockedBy, blocking: [] }));",
  "} else {",
  '  console.error("fake gh: unknown subcommand " + sub);',
  "  process.exit(1);",
  "}",
  "",
].join("\n");

const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

function makeFakeGh(fixture: FixtureIssue[]) {
  const dir = mkdtempSync(join(tmpdir(), "gtabs-fakegh-"));
  tmpDirs.push(dir);
  writeFileSync(join(dir, "fixture.json"), JSON.stringify(fixture));
  writeFileSync(join(dir, "gh"), FAKE_GH);
  chmodSync(join(dir, "gh"), 0o755);
  return {
    ...process.env,
    PATH: `${dir}:${process.env.PATH ?? ""}`,
    GTABS_FAKE_GH_FIXTURE: join(dir, "fixture.json"),
  };
}

describe("buildGraph", () => {
  it("maps blocker -> dependents from native blockedBy (A blocks B => edge A->B)", () => {
    const issues: Issue[] = [
      { number: 1, title: "C1", blockedBy: [] },
      { number: 2, title: "C2", blockedBy: [1] },
    ];

    const graph = buildGraph(issues);

    expect(graph.get(1)).toEqual([2]);
    expect(graph.get(2)).toEqual([]);
  });

  it("drops blockers outside the open set (closed issues are resolved, not nodes)", () => {
    const issues: Issue[] = [
      { number: 1, title: "C1", blockedBy: [99] },
      { number: 2, title: "C2", blockedBy: [1] },
    ];

    const graph = buildGraph(issues);

    expect(graph.get(1)).toEqual([2]);
    expect(graph.has(99)).toBeFalsy();
  });
});

describe("classify", () => {
  it("AC3: no open blockers => READY, any open blocker => BLOCKED", () => {
    const issues: Issue[] = [
      { number: 1, title: "C1", blockedBy: [] },
      { number: 2, title: "C2", blockedBy: [1] },
    ];

    const { ready, blocked } = classify(issues);

    expect(ready.map((i) => i.number)).toEqual([1]);
    expect(blocked.map((i) => i.number)).toEqual([2]);
  });

  it("AC4: a blocker outside the open set counts as resolved => READY", () => {
    const issues: Issue[] = [{ number: 1, title: "C1", blockedBy: [99] }];

    const { ready, blocked } = classify(issues);

    expect(ready.map((i) => i.number)).toEqual([1]);
    expect(blocked).toEqual([]);
  });
});

describe("payout", () => {
  it("AC5: chain C1<-C2<-C3 — C1 READY, ranked top, transitive count 2", () => {
    const issues: Issue[] = [
      { number: 1, title: "C1", blockedBy: [] },
      { number: 2, title: "C2", blockedBy: [1] },
      { number: 3, title: "C3", blockedBy: [2] },
    ];

    const ranked = payout(issues);

    // Only READY cards are ranked; C2 and C3 are blocked.
    expect(ranked).toEqual([{ number: 1, payout: 2 }]);
  });

  it("ranks READY cards by payout descending and ties by issue number ascending", () => {
    const issues: Issue[] = [
      { number: 4, title: "C4", blockedBy: [] },
      { number: 1, title: "C1", blockedBy: [] },
      { number: 2, title: "C2", blockedBy: [1] },
      { number: 3, title: "C3", blockedBy: [2] },
      { number: 5, title: "C5", blockedBy: [] },
    ];

    const ranked = payout(issues);

    expect(ranked).toEqual([
      { number: 1, payout: 2 },
      { number: 4, payout: 0 },
      { number: 5, payout: 0 },
    ]);
  });

  it("AC8: a blockedBy cycle terminates and counts each card once", () => {
    const issues: Issue[] = [
      { number: 1, title: "C1", blockedBy: [] },
      { number: 2, title: "C2", blockedBy: [1, 3] },
      { number: 3, title: "C3", blockedBy: [2] },
    ];

    const ranked = payout(issues);

    expect(ranked).toEqual([{ number: 1, payout: 2 }]);
  });
});

describe("dependsOnRefs", () => {
  it("AC7: does not extract #90 from 'depends on #90a' (word-boundary rule)", () => {
    expect(dependsOnRefs("Fix the flaky test depends on #90a")).toEqual([]);
    expect(dependsOnRefs("Fix the flaky test depends on #90")).toEqual([90]);
  });

  it("extracts multiple refs and never treats 'child of' as 'depends on'", () => {
    expect(dependsOnRefs("Depends on #1 and #2, child of #3")).toEqual([1, 2]);
  });
});

describe("drift", () => {
  it("AC6: open depends-on ref missing from native blockedBy is a violation", () => {
    const issues: Issue[] = [
      { number: 1, title: "C1", blockedBy: [] },
      { number: 2, title: "C2 depends on #1", blockedBy: [] },
    ];

    expect(drift(issues)).toEqual([{ number: 2, ref: 1, title: "C2 depends on #1" }]);
  });

  it("clean when the ref is in blockedBy; closed refs and child-of are ignored", () => {
    const issues: Issue[] = [
      { number: 1, title: "C1", blockedBy: [] },
      { number: 2, title: "C2 depends on #1", blockedBy: [1] },
      { number: 3, title: "C3 depends on #99", blockedBy: [] },
      { number: 4, title: "C4 child of #1", blockedBy: [] },
    ];

    expect(drift(issues)).toEqual([]);
  });
});

describe("loadIssues", () => {
  it("AC2: uses the injected exec and never invokes a real gh/network", async () => {
    const exec = vi.fn<(cmd: string) => string>((cmd) => {
      if (cmd.startsWith("gh issue list")) {
        return JSON.stringify([
          { number: 1, title: "C1" },
          { number: 2, title: "C2" },
        ]);
      }
      if (cmd.includes("view 1")) {
        return JSON.stringify({ title: "C1", blockedBy: [], blocking: [] });
      }
      if (cmd.includes("view 2")) {
        return JSON.stringify({ title: "C2", blockedBy: [{ number: 1 }], blocking: [] });
      }
      throw new Error(`unexpected command: ${cmd}`);
    });

    const issues = loadIssues({ exec });

    expect(exec).toHaveBeenCalledTimes(3);
    expect(exec).toHaveBeenCalledWith("gh issue list --state open --json number,title", {
      encoding: "utf8",
    });
    expect(exec).toHaveBeenCalledWith("gh issue view 1 --json blockedBy,blocking,title", {
      encoding: "utf8",
    });
    expect(exec).toHaveBeenCalledWith("gh issue view 2 --json blockedBy,blocking,title", {
      encoding: "utf8",
    });
    expect(issues).toEqual([
      { number: 1, title: "C1", blockedBy: [] },
      { number: 2, title: "C2", blockedBy: [1] },
    ]);
  });
});

describe("issue-graph CLI", () => {
  it("AC1: npm run graph executes, prints READY, BLOCKED, and payout table", () => {
    const env = makeFakeGh([
      { number: 1, title: "C1", blockedBy: [] },
      { number: 2, title: "C2", blockedBy: [1] },
    ]);

    const res = spawnSync("npm", ["run", "graph"], {
      cwd: REPO_ROOT,
      env,
      encoding: "utf8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("READY:");
    expect(res.stdout).toContain("#1 C1");
    expect(res.stdout).toContain("BLOCKED:");
    expect(res.stdout).toContain("#2 C2");
    expect(res.stdout).toContain("PAYOUT:");
    expect(res.stdout).toContain("#1  1");
  });

  it("AC6: --check-drift exits 1 and prints the violation", () => {
    const env = makeFakeGh([
      { number: 1, title: "C1", blockedBy: [] },
      { number: 2, title: "C2 depends on #1", blockedBy: [] },
    ]);

    const res = spawnSync(process.execPath, [SCRIPT_PATH, "--check-drift"], {
      cwd: REPO_ROOT,
      env,
      encoding: "utf8",
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/drift/i);
    expect(res.stderr).toContain("#2");
    expect(res.stderr).toContain("#1");
  });

  it("rejects unknown flags with a usage error (exit 1)", () => {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, "--bogus"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Usage");
  });
});
