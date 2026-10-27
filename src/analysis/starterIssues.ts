import type { GitHubIssue } from "../github/types.js";
import type {
  AnalysisOptions,
  CandidateStarterIssue,
  ConfidenceTier,
  StarterIssueSignals,
} from "./types.js";

const STARTER_LABEL_REGEX =
  /\b(good\s*[-_]?\s*first\s*[-_]?\s*issue|help\s*[-_]?\s*wanted|beginner(?:-friendly)?|first\s*[-_]?\s*timers?\s*[-_]?\s*only|easy(?:-pick)?|up-for-grabs|starter)\b/i;

/**
 * Checks if a label name or description matches known beginner-friendly tags.
 */
export function isStarterLabel(name: string, description?: string | null): boolean {
  if (STARTER_LABEL_REGEX.test(name)) {
    return true;
  }
  if (description && STARTER_LABEL_REGEX.test(description)) {
    return true;
  }
  return false;
}

/**
 * Extracts individual, isolated signals from a GitHub issue.
 * Pure function with no I/O.
 */
export function extractSignals(
  issue: GitHubIssue,
  options: AnalysisOptions = {},
): StarterIssueSignals {
  const now = options.now ?? new Date();
  const recencyDays = options.recencyDays ?? 90;
  const minBodyChars = options.minBodyChars ?? 100;

  const hasStarterLabel = issue.labels.some((l) => isStarterLabel(l.name, l.description));
  const isUnassigned = !issue.assignee && (!issue.assignees || issue.assignees.length === 0);

  const updatedTime = new Date(issue.updated_at).getTime();
  const nowTime = now.getTime();
  const diffDays = (nowTime - updatedTime) / (1000 * 60 * 60 * 24);
  const updatedRecently = !Number.isNaN(diffDays) && diffDays >= 0 && diffDays <= recencyDays;

  const bodyLength = issue.body ? issue.body.trim().length : 0;
  const hasSubstantialBody = bodyLength >= minBodyChars;

  const commentCount = issue.comments ?? 0;

  return {
    hasStarterLabel,
    isUnassigned,
    updatedRecently,
    hasSubstantialBody,
    commentCount,
  };
}

/**
 * Computes an explainable ranking score for an issue based on its individual signals.
 */
export function calculateScore(signals: StarterIssueSignals): number {
  let score = 0;

  // Labeled issues receive significant priority
  if (signals.hasStarterLabel) {
    score += 1000;
  }

  // Unassigned issues are critical for new contributors so work is not duplicated
  if (signals.isUnassigned) {
    score += 100;
  }

  // Substantial description allows newcomers to understand requirements without ambiguity
  if (signals.hasSubstantialBody) {
    score += 50;
  }

  // Recently updated issues ensure active maintainer engagement
  if (signals.updatedRecently) {
    score += 30;
  }

  // Low comment contention: 0-2 comments indicate uncontested issues
  if (signals.commentCount === 0) {
    score += 20;
  } else if (signals.commentCount <= 3) {
    score += 15;
  } else if (signals.commentCount <= 6) {
    score += 5;
  }

  return score;
}

/**
 * Generates transparent, human-readable rationale bullet points explaining the ranking.
 */
export function generateReasons(
  signals: StarterIssueSignals,
  matchedLabels: string[],
  confidence: ConfidenceTier,
): string[] {
  const reasons: string[] = [];

  if (confidence === "labeled" && matchedLabels.length > 0) {
    reasons.push(`Labeled with beginner-friendly tag(s): ${matchedLabels.join(", ")}`);
  } else if (confidence === "heuristic-only") {
    reasons.push("No beginner labels found; evaluated using contributor accessibility heuristics");
  }

  if (signals.isUnassigned) {
    reasons.push("Unassigned: no current assignee found");
  } else {
    reasons.push("Assigned: contributor or maintainer already assigned");
  }

  if (signals.hasSubstantialBody) {
    reasons.push("Detailed issue description providing clear context");
  } else {
    reasons.push("Brief description: may require requesting clarifying details");
  }

  if (signals.updatedRecently) {
    reasons.push("Recently active: updated within active maintenance window");
  } else {
    reasons.push("Stale activity: no recent updates recorded");
  }

  if (signals.commentCount === 0) {
    reasons.push("Zero comments: discussion is open and uncontested");
  } else if (signals.commentCount <= 3) {
    reasons.push(
      `Low discussion volume (${signals.commentCount} comments): accessible for new contributors`,
    );
  } else {
    reasons.push(`Active discussion thread (${signals.commentCount} comments)`);
  }

  return reasons;
}

/**
 * Pure analysis function evaluating and ranking open issues.
 * Implements fallback: when no issues carry starter labels, heuristic-only candidates
 * are returned marked with 'heuristic-only' confidence, avoiding an empty list.
 */
export function analyzeStarterIssues(
  issues: GitHubIssue[],
  options: AnalysisOptions = {},
): CandidateStarterIssue[] {
  if (issues.length === 0) {
    return [];
  }

  // First pass: extract signals and matched labels
  const evaluated = issues.map((issue) => {
    const signals = extractSignals(issue, options);
    const matchedLabels = issue.labels
      .filter((l) => isStarterLabel(l.name, l.description))
      .map((l) => l.name);

    return {
      issue,
      signals,
      matchedLabels,
      score: calculateScore(signals),
    };
  });

  // Check if any issue carries explicit starter labels
  const hasAnyStarterLabels = evaluated.some((item) => item.signals.hasStarterLabel);

  const candidates: CandidateStarterIssue[] = evaluated.map((item) => {
    // If repo has labeled issues, only labeled ones get 'labeled' tier
    // If repo has NO labeled issues, all returned candidates get 'heuristic-only' tier
    const confidence: ConfidenceTier =
      hasAnyStarterLabels && item.signals.hasStarterLabel ? "labeled" : "heuristic-only";

    const reasons = generateReasons(item.signals, item.matchedLabels, confidence);

    return {
      number: item.issue.number,
      title: item.issue.title,
      url: item.issue.html_url,
      body: item.issue.body,
      labels: item.issue.labels.map((l) => l.name),
      signals: item.signals,
      reasons,
      confidence,
      score: item.score,
    };
  });

  // Sort descending by score, then by recency (updated_at)
  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const issueA = issues.find((i) => i.number === a.number);
    const issueB = issues.find((i) => i.number === b.number);
    const timeA = issueA ? new Date(issueA.updated_at).getTime() : 0;
    const timeB = issueB ? new Date(issueB.updated_at).getTime() : 0;
    return timeB - timeA;
  });

  return candidates;
}
