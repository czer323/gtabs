export type CheckResult = {
  ok: boolean;
  failedStep?: string;
};

export function runChecks(options?: {
  steps?: string[];
  exec?: (command: string, options?: object) => unknown;
  out?: { write: (chunk: string) => void };
  err?: { write: (chunk: string) => void };
  verbose?: boolean;
}): CheckResult;
