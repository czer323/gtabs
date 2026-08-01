import { describe, it, expect, vi } from "vitest";
import { runChecks } from "./check.mjs";

type CheckResult = { ok: boolean; failedStep?: string };

const STEPS = ["npm run test", "npm run format:check", "npm run lint", "npm run typecheck"];

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
