import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const STEPS = ["test", "format:check", "lint", "typecheck"];

export function runChecks({
  steps = STEPS,
  exec = execSync,
  out = process.stdout,
  err = process.stderr,
} = {}) {
  for (const step of steps) {
    try {
      exec(`npm run ${step}`, { stdio: ["inherit", "pipe", "pipe"], encoding: "utf8" });
    } catch (e) {
      const detail = [e.stdout, e.stderr].filter(Boolean).join("");
      err.write(`check failed: ${step}\n`);
      if (detail) err.write(`${detail.replace(/\n$/, "")}\n`);
      return { ok: false, failedStep: step };
    }
  }
  out.write("check: no issues\n");
  return { ok: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runChecks().ok ? 0 : 1);
}
