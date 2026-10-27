import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitHubClient, parseRepoIdentifier, GitHubClientError } from "../github/client.js";
import { analyzeStarterIssues } from "../analysis/starterIssues.js";
import type { CandidateStarterIssue } from "../analysis/types.js";
import { logger } from "../logger.js";

export const FindStarterIssuesInputSchema = {
  repo: z
    .string()
    .min(1)
    .describe(
      "GitHub repository in 'owner/name' format (e.g., 'facebook/react' or 'adity0208/repopilot-mcp')",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(15)
    .default(10)
    .describe("Maximum number of issues to return (1-15, default 10)"),
};

export interface FindStarterIssuesArgs {
  repo: string;
  limit?: number;
}

/**
 * Truncates user-generated text to a safe length for LLM processing.
 */
export function truncateText(text: string | null | undefined, maxLength = 400): string {
  if (!text || text.trim().length === 0) {
    return "[No description provided]";
  }
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}... [truncated]`;
}

/**
 * Wraps user-supplied, untrusted content (titles, issue bodies) in strict delimiters.
 * Protects against prompt injection and ensures clear provenance for downstream LLM evaluation.
 */
export function wrapUntrusted(label: "TITLE" | "BODY", content: string): string {
  return `<<<UNTRUSTED_CONTENT:${label}>>>\n${content}\n<<<END_UNTRUSTED_CONTENT>>>`;
}

/**
 * Formats ranked starter issues into a clean, human-readable markdown presentation.
 */
export function formatStarterIssuesText(
  repoName: string,
  candidates: CandidateStarterIssue[],
  limit: number,
): string {
  if (candidates.length === 0) {
    return `## Starter Issues for ${repoName}\n\nNo open candidate issues found. The repository currently has no open issues.`;
  }

  const results = candidates.slice(0, limit);
  const labeledCount = results.filter((c) => c.confidence === "labeled").length;
  const heuristicCount = results.length - labeledCount;

  let summaryHeader = `## Starter Issues for ${repoName}\n`;
  if (labeledCount > 0 && heuristicCount === 0) {
    summaryHeader += `Found ${results.length} candidate issue(s) carrying explicit beginner-friendly labels.`;
  } else if (labeledCount > 0 && heuristicCount > 0) {
    summaryHeader += `Found ${results.length} candidate issue(s) (${labeledCount} with beginner labels, ${heuristicCount} ranked via heuristics).`;
  } else {
    summaryHeader += `> [!NOTE]\n> No issues with explicit beginner labels ('good first issue', etc.) were found.\n> Showing ${results.length} issue(s) ranked using contributor heuristics (unassigned, clear context, recent activity).`;
  }

  const issueBlocks = results.map((issue, index) => {
    const tierIcon = issue.confidence === "labeled" ? "🟢 Labeled" : "🟡 Heuristic-Only";
    const labelsList =
      issue.labels.length > 0 ? issue.labels.map((l) => `\`${l}\``).join(", ") : "_none_";
    const reasonsList = issue.reasons.map((r) => `  - ${r}`).join("\n");
    const signalsSummary = `unassigned: ${issue.signals.isUnassigned}, updatedRecently: ${issue.signals.updatedRecently}, substantialBody: ${issue.signals.hasSubstantialBody}, comments: ${issue.signals.commentCount}`;

    const safeTitle = wrapUntrusted("TITLE", issue.title);
    const safeBody = wrapUntrusted("BODY", truncateText(issue.body, 400));

    return [
      `### ${index + 1}. Issue #${issue.number}`,
      `- **URL**: ${issue.url}`,
      `- **Confidence Tier**: ${tierIcon}`,
      `- **Labels**: ${labelsList}`,
      `- **Signals**: ${signalsSummary}`,
      `- **Heuristic Reasons**:\n${reasonsList}`,
      `- **Title**:\n${safeTitle}`,
      `- **Description Preview**:\n${safeBody}`,
    ].join("\n");
  });

  return `${summaryHeader}\n\n---\n\n${issueBlocks.join("\n\n---\n\n")}`;
}

export interface FindStarterIssuesResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent: {
    repo: string;
    totalEvaluated: number;
    returnedCount: number;
    hasLabeledIssues: boolean;
    issues: Array<{
      number: number;
      title: string;
      url: string;
      labels: string[];
      confidence: "labeled" | "heuristic-only";
      score: number;
      signals: CandidateStarterIssue["signals"];
      reasons: string[];
    }>;
  };
  isError?: boolean;
}

/**
 * Handler for the find_starter_issues tool.
 */
export async function handleFindStarterIssues(
  args: FindStarterIssuesArgs,
  client: GitHubClient = new GitHubClient(),
): Promise<FindStarterIssuesResult> {
  const coords = parseRepoIdentifier(args.repo);
  const limit = Math.min(Math.max(1, args.limit ?? 10), 15);

  logger.info(
    `Finding starter issues for repository ${coords.owner}/${coords.repo} (limit: ${limit})`,
  );

  const rawIssues = await client.fetchOpenIssues(coords.owner, coords.repo, {
    perPage: 50,
  });

  const candidates = analyzeStarterIssues(rawIssues);
  const results = candidates.slice(0, limit);
  const hasLabeledIssues = results.some((r) => r.confidence === "labeled");

  const formattedText = formatStarterIssuesText(
    `${coords.owner}/${coords.repo}`,
    candidates,
    limit,
  );

  return {
    content: [
      {
        type: "text" as const,
        text: formattedText,
      },
    ],
    structuredContent: {
      repo: `${coords.owner}/${coords.repo}`,
      totalEvaluated: candidates.length,
      returnedCount: results.length,
      hasLabeledIssues,
      issues: results.map((issue) => ({
        number: issue.number,
        title: issue.title,
        url: issue.url,
        labels: issue.labels,
        confidence: issue.confidence,
        score: issue.score,
        signals: issue.signals,
        reasons: issue.reasons,
      })),
    },
  };
}

/**
 * Registers the find_starter_issues tool with an McpServer instance.
 */
export function registerFindStarterIssuesTool(server: McpServer, client?: GitHubClient): void {
  server.registerTool(
    "find_starter_issues",
    {
      description:
        "Discovers potentially beginner-friendly GitHub issues for a repository using explainable heuristics, confidence tiers, and evidence links.",
      inputSchema: FindStarterIssuesInputSchema,
    },
    async (args) => {
      try {
        return await handleFindStarterIssues(
          {
            repo: args.repo,
            limit: args.limit,
          },
          client,
        );
      } catch (err: unknown) {
        logger.error(`Error executing find_starter_issues for '${args.repo}':`, err);
        const errorMessage =
          err instanceof GitHubClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error finding starter issues for '${args.repo}': ${errorMessage}`,
            },
          ],
          structuredContent: {
            repo: args.repo,
            totalEvaluated: 0,
            returnedCount: 0,
            hasLabeledIssues: false,
            issues: [],
          },
        };
      }
    },
  );
}
