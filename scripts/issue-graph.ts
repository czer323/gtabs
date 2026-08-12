import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Board dependency graph compiled from GitHub's native `blockedBy` (single
// source of truth). Fetches all open issues via `gh`, classifies each card as
// READY or BLOCKED, and ranks READY cards by how many downstream open cards
// they transitively unblock (payout). `--check-drift` fails when a title's
// `depends on` clause references an open issue missing from native `blockedBy`.

export type Issue = {
  number: number;
  title: string;
  /** Native `blockedBy` issue numbers (the blockers of this card). */
  blockedBy: number[];
};

export type PayoutRow = { number: number; payout: number };

export type DriftViolation = { number: number; ref: number; title: string };

const GH_LIST = "gh issue list --state open --json number,title";
const GH_VIEW = (number: number) => `gh issue view ${number} --json blockedBy,blocking,title`;

/** Fetches open issues with their native blockedBy via `gh` through an injected exec. */
export function loadIssues({ exec = execSync }: { exec?: typeof execSync } = {}): Issue[] {
  const listed = JSON.parse(String(exec(GH_LIST, { encoding: "utf8" })));
  return listed.map((item: { number: number; title: string }) => {
    const view = JSON.parse(String(exec(GH_VIEW(item.number), { encoding: "utf8" })));
    return {
      number: item.number,
      title: view.title,
      blockedBy: (view.blockedBy ?? []).map((b: { number: number }) => b.number),
    };
  });
}

/**
 * Builds the dependency DAG. Edge A->B means A is in B's native `blockedBy`
 * (A blocks B). Blockers outside the open set are resolved, so they are not
 * nodes and produce no edges. Cycles are possible; callers must traverse with
 * a visited set.
 */
export function buildGraph(issues: Issue[]): Map<number, number[]> {
  const open = new Set(issues.map((i) => i.number));
  const graph = new Map<number, number[]>();
  for (const issue of issues) graph.set(issue.number, []);
  for (const issue of issues) {
    for (const blocker of issue.blockedBy) {
      if (open.has(blocker)) graph.get(blocker)!.push(issue.number);
    }
  }
  return graph;
}

/**
 * READY when every `blockedBy` entry is outside the open set (absent or
 * resolved); BLOCKED when at least one `blockedBy` entry is in the open set.
 */
export function classify(issues: Issue[]): { ready: Issue[]; blocked: Issue[] } {
  const open = new Set(issues.map((i) => i.number));
  const ready: Issue[] = [];
  const blocked: Issue[] = [];
  for (const issue of issues) {
    (issue.blockedBy.some((n) => open.has(n)) ? blocked : ready).push(issue);
  }
  return { ready, blocked };
}

/**
 * For each READY card, counts the distinct open cards reachable via blocking
 * edges, transitively. Ranked by payout descending, ties by issue number
 * ascending. Only READY cards are ranked.
 */
export function payout(
  issues: Issue[],
  graph: ReadonlyMap<number, readonly number[]> = buildGraph(issues),
): PayoutRow[] {
  const { ready } = classify(issues);
  const rows: PayoutRow[] = [];
  for (const issue of ready) {
    const seen = new Set<number>();
    const stack = [...(graph.get(issue.number) ?? [])];
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(graph.get(n) ?? []));
    }
    rows.push({ number: issue.number, payout: seen.size });
  }
  rows.sort((a, b) => b.payout - a.payout || a.number - b.number);
  return rows;
}

/**
 * Extracts issue refs from a title's `depends on` clauses. The `\b` after each
 * number enforces a word boundary: `depends on #90a` must not yield #90.
 * `child of` clauses never match and are excluded.
 */
export function dependsOnRefs(title: string): number[] {
  const refs: number[] = [];
  const clause = /depends\s+on\s+#(\d+)\b(?:\s*(?:and|,)\s*#(\d+)\b)*/gi;
  for (const match of title.matchAll(clause)) {
    for (let group = 1; group < match.length; group++) {
      if (match[group] !== undefined) refs.push(Number(match[group]));
    }
  }
  return refs;
}

/**
 * Drift: a title's `depends on` ref to an OPEN issue must appear in that
 * card's native `blockedBy`, else it is a violation. Refs to non-open issues
 * are ignored (documented limitation).
 */
export function drift(issues: Issue[]): DriftViolation[] {
  const open = new Set(issues.map((i) => i.number));
  const violations: DriftViolation[] = [];
  for (const issue of issues) {
    const native = new Set(issue.blockedBy);
    for (const ref of dependsOnRefs(issue.title)) {
      if (open.has(ref) && !native.has(ref)) {
        violations.push({ number: issue.number, ref, title: issue.title });
      }
    }
  }
  return violations;
}

function main(): void {
  const args = process.argv.slice(2);
  const checkDrift = args.includes("--check-drift");
  const unknown = args.filter((arg) => arg !== "--check-drift");
  if (unknown.length > 0) {
    console.error("Usage: node scripts/issue-graph.ts [--check-drift]");
    process.exit(1);
  }

  const issues = loadIssues();
  const { ready, blocked } = classify(issues);
  const ranked = payout(issues);

  console.log("READY:");
  for (const issue of ready) console.log(`  #${issue.number} ${issue.title}`);
  console.log("BLOCKED:");
  for (const issue of blocked) console.log(`  #${issue.number} ${issue.title}`);
  console.log("PAYOUT:");
  for (const row of ranked) console.log(`  #${row.number}  ${row.payout}`);

  if (checkDrift) {
    const violations = drift(issues);
    if (violations.length > 0) {
      for (const v of violations) {
        console.error(
          `drift: #${v.number} "${v.title}" depends on #${v.ref} but #${v.ref} is missing from its blockedBy`,
        );
      }
      process.exit(1);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
