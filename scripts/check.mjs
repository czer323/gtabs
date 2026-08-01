import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const STEPS = ["test", "format:check", "lint", "typecheck"];

export function runChecks({
  steps = STEPS,
  exec = execSync,
  out = process.stdout,
  err = process.stderr,
  verbose = false,
} = {}) {
  const stdio = verbose ? ["inherit", "inherit", "inherit"] : ["inherit", "pipe", "pipe"];
  for (const step of steps) {
    try {
      exec(`npm run ${step}`, { stdio, encoding: "utf8" });
    } catch (e) {
      err.write(`check failed: ${step}\n`);
      // In verbose mode the step output already streamed through; never re-echo it.
      if (!verbose) {
        const detail = [e.stdout, e.stderr].filter(Boolean).join("");
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
