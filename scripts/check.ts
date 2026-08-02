import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const STEPS = ["test", "format:check", "lint", "typecheck", "build"] as const;

type ExecFn = (command: string, options?: object) => unknown;
type Stream = { write: (chunk: string) => void };

export type CheckResult = { ok: boolean; failedStep?: string };

export function runChecks({
  steps = STEPS,
  exec = execSync,
  out = process.stdout,
  err = process.stderr,
  verbose = false,
}: {
  steps?: readonly string[];
  exec?: ExecFn;
  out?: Stream;
  err?: Stream;
  verbose?: boolean;
} = {}): CheckResult {
  const stdio = verbose ? ["inherit", "inherit", "inherit"] : ["inherit", "pipe", "pipe"];
  for (const step of steps) {
    try {
      exec(`npm run ${step}`, { stdio, encoding: "utf8" });
    } catch (e) {
      err.write(`check failed: ${step}\n`);
      // In verbose mode the step output already streamed through; never re-echo it.
      if (!verbose) {
        const isErr = typeof e === "object" && e !== null;
        const stdout = isErr && "stdout" in e ? String(e.stdout) : "";
        const stderr = isErr && "stderr" in e ? String(e.stderr) : "";
        const detail = [stdout, stderr].filter(Boolean).join("");
        if (detail) err.write(`${detail.replace(/\n$/, "")}\n`);
      }
      return { ok: false, failedStep: step };
    }
  }
  out.write("check: no issues\n");
  return { ok: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const verbose = process.argv.slice(2).includes("show");
  process.exit(runChecks({ verbose }).ok ? 0 : 1);
}
