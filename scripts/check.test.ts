import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecks } from "./check.mjs";

type CheckResult = { ok: boolean; failedStep?: string };

const STEPS = ["npm run test", "npm run format:check", "npm run lint", "npm run typecheck"];
const SCRIPT_PATH = join(import.meta.dirname, "check.mjs");

function harness(exec: (cmd: string) => void) {
  return {
    exec: vi.fn<(cmd: string) => void>(exec),
    out: { write: vi.fn<(msg: string) => void>() },
    err: { write: vi.fn<(msg: string) => void>() },
  };
}

function failingError(stderr: string): Error {
  return Object.assign(new Error("command failed"), { stdout: "", stderr });
}

function writeFakeNpm(dir: string, { failLint }: { failLint: boolean }) {
  const body = failLint
    ? [
        "#!/bin/sh",
        'case "$2" in',
        '  lint) echo "fake-npm:lint" >&2; exit 1 ;;',
        '  *) echo "fake-npm:$2"; exit 0 ;;',
        "esac",
        "",
      ].join("\n")
    : '#!/bin/sh\necho "fake-npm:$2"; exit 0\n';
  const bin = join(dir, "npm");
  writeFileSync(bin, body);
  chmodSync(bin, 0o755);
}

describe("runChecks", () => {
  it("runs every step in order and prints one success line", () => {
    const calls: string[] = [];
    const h = harness((cmd) => {
      calls.push(cmd);
    });

    const result: CheckResult = runChecks({ exec: h.exec, out: h.out, err: h.err });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(STEPS);
    expect(h.out.write).toHaveBeenCalledWith("check: no issues\n");
    expect(h.err.write).not.toHaveBeenCalled();
  });

  it("captures step output in the default terse mode", () => {
    const h = harness(() => {});

    runChecks({ exec: h.exec, out: h.out, err: h.err });

    for (const [, opts] of h.exec.mock.calls) {
      expect(opts).toMatchObject({ stdio: ["inherit", "pipe", "pipe"] });
    }
  });

  it("reports the failing step and its captured output", () => {
    const h = harness((cmd) => {
      if (cmd === "npm run lint") {
        throw failingError("src/foo.ts:1:1 error eslint(no-unused-vars): unused\n");
      }
    });

    const result: CheckResult = runChecks({ exec: h.exec, out: h.out, err: h.err });

    expect(result.ok).toBeFalsy();
    expect(result.failedStep).toBe("lint");
    expect(h.err.write).toHaveBeenCalledWith("check failed: lint\n");
    expect(h.err.write).toHaveBeenCalledWith(expect.stringContaining("eslint(no-unused-vars)"));
    expect(h.out.write).not.toHaveBeenCalled();
  });

  it("streams each step's output in verbose mode", () => {
    const h = harness(() => {});

    const result: CheckResult = runChecks({ exec: h.exec, out: h.out, err: h.err, verbose: true });

    expect(result.ok).toBe(true);
    expect(h.exec).toHaveBeenCalledTimes(4);
    for (const [, opts] of h.exec.mock.calls) {
      expect(opts).toMatchObject({ stdio: ["inherit", "inherit", "inherit"] });
    }
    expect(h.out.write).toHaveBeenCalledWith("check: no issues\n");
    expect(h.err.write).not.toHaveBeenCalled();
  });

  it("verbose failure reports the failing step without re-echoing streamed output", () => {
    const h = harness((cmd) => {
      if (cmd === "npm run lint") {
        throw failingError("src/foo.ts:1:1 error eslint(no-unused-vars): unused\n");
      }
    });

    const result: CheckResult = runChecks({ exec: h.exec, out: h.out, err: h.err, verbose: true });

    expect(result.ok).toBeFalsy();
    expect(result.failedStep).toBe("lint");
    expect(h.err.write).toHaveBeenCalledWith("check failed: lint\n");
    expect(h.err.write).not.toHaveBeenCalledWith(expect.stringContaining("eslint(no-unused-vars)"));
    expect(h.out.write).not.toHaveBeenCalled();
  });

  it("stops at the first failure and skips later steps", () => {
    const calls: string[] = [];
    const h = harness((cmd) => {
      calls.push(cmd);
      if (cmd === "npm run format:check") {
        throw failingError("unformatted\n");
      }
    });

    const result: CheckResult = runChecks({ exec: h.exec, out: h.out, err: h.err });

    expect(result.ok).toBeFalsy();
    expect(result.failedStep).toBe("format:check");
    expect(calls).toEqual(["npm run test", "npm run format:check"]);
  });

  it("uses the default steps when none are provided", () => {
    const h = harness(() => {});

    const result: CheckResult = runChecks({ exec: h.exec, out: h.out, err: h.err });

    expect(result.ok).toBe(true);
    expect(h.exec).toHaveBeenCalledTimes(4);
  });
});

describe("check CLI entry", () => {
  let passBin: string;
  let failLintBin: string;

  beforeAll(() => {
    passBin = mkdtempSync(join(tmpdir(), "gtabs-check-ok-"));
    failLintBin = mkdtempSync(join(tmpdir(), "gtabs-check-fail-"));
    writeFakeNpm(passBin, { failLint: false });
    writeFakeNpm(failLintBin, { failLint: true });
  });

  afterAll(() => {
    rmSync(passBin, { recursive: true, force: true });
    rmSync(failLintBin, { recursive: true, force: true });
  });

  function runCli(binDir: string, args: string[]) {
    return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
      encoding: "utf8",
    });
  }

  it("check with no arguments stays terse — only prints check: no issues", () => {
    const res = runCli(passBin, []);

    expect(res.status).toBe(0);
    expect(res.stdout).toBe("check: no issues\n");
    expect(res.stderr).toBe("");
  });

  it("check show streams every step's output then ends with check: no issues", () => {
    const res = runCli(passBin, ["show"]);

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("fake-npm:test");
    expect(res.stdout).toContain("fake-npm:format:check");
    expect(res.stdout).toContain("fake-npm:lint");
    expect(res.stdout).toContain("fake-npm:typecheck");
    expect(res.stdout).toContain("check: no issues\n");
  });

  it("check show fails loudly on a failing step and exits 1", () => {
    const res = runCli(failLintBin, ["show"]);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("fake-npm:lint");
    expect(res.stderr).toMatch(/check failed: lint\n$/);
  });
});
