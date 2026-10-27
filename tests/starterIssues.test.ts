import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeStarterIssues,
  extractSignals,
  isStarterLabel,
} from "../src/analysis/starterIssues.js";
import type { GitHubIssue } from "../src/github/types.js";

const fixturesDir = join(__dirname, "fixtures");
const rawIssuesFixture = JSON.parse(
  readFileSync(join(fixturesDir, "githubIssues.json"), "utf8"),
) as Array<GitHubIssue & { pull_request?: unknown }>;
const rawIssuesNoLabelsFixture = JSON.parse(
  readFileSync(join(fixturesDir, "githubIssuesNoLabels.json"), "utf8"),
) as Array<GitHubIssue & { pull_request?: unknown }>;

// Exclude PRs as GitHubClient does
const issuesOnly = rawIssuesFixture.filter((i) => !i.pull_request);
const issuesNoLabelsOnly = rawIssuesNoLabelsFixture.filter((i) => !i.pull_request);

const simulatedNow = new Date("2026-10-26T00:00:00Z");

describe("starterIssues - individual signals", () => {
  it("detects starter labels correctly", () => {
    expect(isStarterLabel("good first issue")).toBe(true);
    expect(isStarterLabel("help wanted")).toBe(true);
    expect(isStarterLabel("beginner-friendly")).toBe(true);
    expect(isStarterLabel("first-timers-only")).toBe(true);
    expect(isStarterLabel("easy-pick")).toBe(true);
    expect(isStarterLabel("up-for-grabs")).toBe(true);
    expect(isStarterLabel("starter")).toBe(true);

    // Negative cases
    expect(isStarterLabel("bug")).toBe(false);
    expect(isStarterLabel("enhancement")).toBe(false);
    expect(isStarterLabel("documentation")).toBe(false);
    expect(isStarterLabel("wontfix")).toBe(false);
  });

  it("extracts signals accurately for an unassigned, labeled, recent issue", () => {
    const issue1 = issuesOnly.find((i) => i.number === 1)!;
    const signals = extractSignals(issue1, { now: simulatedNow, recencyDays: 90 });

    expect(signals.hasStarterLabel).toBe(true);
    expect(signals.isUnassigned).toBe(true);
    expect(signals.updatedRecently).toBe(true);
    expect(signals.hasSubstantialBody).toBe(true);
    expect(signals.commentCount).toBe(1);
  });

  it("extracts signals accurately for an assigned issue with help wanted label", () => {
    const issue3 = issuesOnly.find((i) => i.number === 3)!;
    const signals = extractSignals(issue3, { now: simulatedNow, recencyDays: 90 });

    expect(signals.hasStarterLabel).toBe(true);
    expect(signals.isUnassigned).toBe(false);
    expect(signals.updatedRecently).toBe(true);
    expect(signals.hasSubstantialBody).toBe(true);
    expect(signals.commentCount).toBe(2);
  });

  it("extracts signals accurately for an issue with short body and no starter label", () => {
    const issue4 = issuesOnly.find((i) => i.number === 4)!;
    const signals = extractSignals(issue4, { now: simulatedNow, minBodyChars: 100 });

    expect(signals.hasStarterLabel).toBe(false);
    expect(signals.isUnassigned).toBe(true);
    expect(signals.hasSubstantialBody).toBe(false);
    expect(signals.commentCount).toBe(0);
  });

  it("extracts signals accurately for an old issue updated beyond recencyDays", () => {
    const issue5 = issuesOnly.find((i) => i.number === 5)!;
    // updated in Jan 2026, simulatedNow is Oct 2026 (> 250 days ago)
    const signals = extractSignals(issue5, { now: simulatedNow, recencyDays: 90 });

    expect(signals.hasStarterLabel).toBe(true);
    expect(signals.updatedRecently).toBe(false);
    expect(signals.isUnassigned).toBe(true);
  });
});

describe("starterIssues - ranking order and confidence tiers", () => {
  it("ranks labeled, unassigned, active issues highest", () => {
    const candidates = analyzeStarterIssues(issuesOnly, { now: simulatedNow });

    expect(candidates.length).toBe(5);

    // Issue #1 is labeled, unassigned, recent, substantial body -> highest ranked
    expect(candidates[0]!.number).toBe(1);
    expect(candidates[0]!.confidence).toBe("labeled");
    expect(candidates[0]!.signals.hasStarterLabel).toBe(true);
    expect(candidates[0]!.signals.isUnassigned).toBe(true);
    expect(candidates[0]!.reasons.some((r) => r.includes("beginner-friendly tag"))).toBe(true);

    // Labeled issues (#1, #3, #5) should rank above unlabeled issues (#4, #7)
    const topThreeNumbers = candidates.slice(0, 3).map((c) => c.number);
    expect(topThreeNumbers).toContain(1);
    expect(topThreeNumbers).toContain(3);
    expect(topThreeNumbers).toContain(5);

    // Verify non-labeled issues in a repo with labeled ones are tagged heuristic-only
    const nonLabeled = candidates.filter((c) => !c.signals.hasStarterLabel);
    expect(nonLabeled.length).toBe(2);
    expect(nonLabeled.every((c) => c.confidence === "heuristic-only")).toBe(true);
  });
});

describe("starterIssues - fallback for repositories with zero starter labels", () => {
  it("returns ranked heuristic-only candidates and never an empty list when open issues exist", () => {
    const candidates = analyzeStarterIssues(issuesNoLabelsOnly, { now: simulatedNow });

    // Ensure it did not return an empty list
    expect(candidates.length).toBe(3); // #101, #102, #104 (PR #103 filtered)

    // All candidates in an unlabeled repository are clearly marked as heuristic-only
    expect(candidates.every((c) => c.confidence === "heuristic-only")).toBe(true);

    // All candidates explain that no beginner labels were present
    expect(
      candidates.every((c) => c.reasons.some((r) => r.includes("No beginner labels found"))),
    ).toBe(true);

    // Issue #101 is unassigned, has a 250-char description, recent, 0 comments -> rank #1
    expect(candidates[0]!.number).toBe(101);
    expect(candidates[0]!.signals.isUnassigned).toBe(true);
    expect(candidates[0]!.signals.hasSubstantialBody).toBe(true);

    // Issue #102 is assigned to dev2 and has high comments -> ranked lower than #101 and #104
    expect(candidates[2]!.number).toBe(102);
  });

  it("returns empty array only when input issue list is truly empty", () => {
    expect(analyzeStarterIssues([])).toEqual([]);
  });
});
