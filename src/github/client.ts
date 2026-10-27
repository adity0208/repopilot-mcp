import process from "node:process";
import type { GitHubIssue, GitHubLabel, GitHubRawIssue, RepoCoordinates } from "./types.js";

const OWNER_REGEX = /^[A-Za-z0-9-]{1,39}$/;
const REPO_REGEX = /^[A-Za-z0-9._-]{1,100}$/;

export class GitHubClientError extends Error {
  readonly statusCode?: number;
  readonly isRateLimit: boolean;
  readonly resetTime?: string;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      isRateLimit?: boolean;
      resetTime?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "GitHubClientError";
    this.statusCode = options?.statusCode;
    this.isRateLimit = options?.isRateLimit ?? false;
    this.resetTime = options?.resetTime;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export class GitHubValidationError extends GitHubClientError {
  constructor(message: string) {
    super(message);
    this.name = "GitHubValidationError";
  }
}

export class GitHubTimeoutError extends GitHubClientError {
  constructor(timeoutMs: number) {
    super(`Request to GitHub API timed out after ${timeoutMs}ms`);
    this.name = "GitHubTimeoutError";
  }
}

/**
 * Validates owner and repository names against strict GitHub naming rules.
 * Rejects illegal paths, directory traversals ("." and ".."), and special characters.
 */
export function validateOwnerRepo(owner: string, repo: string): RepoCoordinates {
  if (!owner || !OWNER_REGEX.test(owner)) {
    throw new GitHubValidationError(
      `Invalid repository owner '${owner}'. Owner must match ^[A-Za-z0-9-]{1,39}$.`,
    );
  }

  if (repo === "." || repo === ".." || !repo || !REPO_REGEX.test(repo)) {
    throw new GitHubValidationError(
      `Invalid repository name '${repo}'. Repo must match ^[A-Za-z0-9._-]{1,100}$ and cannot be '.' or '..'.`,
    );
  }

  return { owner, repo };
}

/**
 * Parses and strictly validates a repository identifier in 'owner/repo' format.
 */
export function parseRepoIdentifier(input: string): RepoCoordinates {
  const trimmed = input.trim();
  const parts = trimmed.split("/");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new GitHubValidationError(
      `Invalid repository format '${input}'. Expected 'owner/repo' (e.g., 'facebook/react').`,
    );
  }

  return validateOwnerRepo(parts[0], parts[1]);
}

export interface GitHubClientOptions {
  token?: string;
  timeoutMs?: number;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class GitHubClient {
  private readonly token?: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: GitHubClientOptions = {}) {
    // Note: token is stored in memory and NEVER logged
    this.token = options.token ?? process.env.GITHUB_TOKEN;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/+$/, "");
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  /**
   * Fetches a bounded single page of open issues for a repository.
   * Pull requests returned by GitHub's issues endpoint are automatically filtered out.
   */
  async fetchOpenIssues(
    owner: string,
    repo: string,
    options?: { perPage?: number },
  ): Promise<GitHubIssue[]> {
    const coords = validateOwnerRepo(owner, repo);
    const perPage = Math.min(Math.max(1, options?.perPage ?? 30), 100);

    const url = new URL(`${this.baseUrl}/repos/${coords.owner}/${coords.repo}/issues`);
    url.searchParams.set("state", "open");
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", "1");
    url.searchParams.set("sort", "updated");
    url.searchParams.set("direction", "desc");

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "repopilot-mcp",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (this.token && this.token.trim().length > 0) {
      headers.Authorization = `Bearer ${this.token.trim()}`;
    }

    let response: Response;
    try {
      response = await this.fetchFn(url.toString(), {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new GitHubTimeoutError(this.timeoutMs);
      }
      throw new GitHubClientError(
        `Network error connecting to GitHub API: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    if (!response.ok) {
      this.handleHttpError(response, coords);
    }

    const rawData = (await response.json()) as GitHubRawIssue[];
    if (!Array.isArray(rawData)) {
      throw new GitHubClientError(
        `Unexpected GitHub API response: expected an array of issues for ${coords.owner}/${coords.repo}.`,
      );
    }

    // Filter out pull requests (the issues endpoint returns both issues and PRs)
    const issuesOnly = rawData.filter((item) => item.pull_request === undefined);

    return issuesOnly.map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      html_url: issue.html_url,
      state: issue.state,
      labels: (issue.labels ?? []).map((lbl): GitHubLabel => {
        if (typeof lbl === "string") {
          return { name: lbl };
        }
        return {
          id: lbl.id,
          name: lbl.name,
          description: lbl.description,
          color: lbl.color,
        };
      }),
      assignee: issue.assignee,
      assignees: issue.assignees ?? (issue.assignee ? [issue.assignee] : []),
      comments: issue.comments ?? 0,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      closed_at: issue.closed_at,
    }));
  }

  private handleHttpError(response: Response, coords: RepoCoordinates): never {
    const status = response.status;

    if (status === 404) {
      throw new GitHubClientError(
        `Repository '${coords.owner}/${coords.repo}' not found or is private. If private, check GITHUB_TOKEN.`,
        { statusCode: 404 },
      );
    }

    if (status === 403 || status === 429) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      const resetEpoch = response.headers.get("x-ratelimit-reset");
      const retryAfter = response.headers.get("retry-after");

      let resetTime: string | undefined;
      if (resetEpoch) {
        const epochSeconds = Number(resetEpoch);
        if (!Number.isNaN(epochSeconds) && epochSeconds > 0) {
          resetTime = new Date(epochSeconds * 1000).toISOString();
        }
      } else if (retryAfter) {
        const seconds = Number(retryAfter);
        if (!Number.isNaN(seconds) && seconds > 0) {
          resetTime = new Date(Date.now() + seconds * 1000).toISOString();
        }
      }

      const isRateLimit = remaining === "0" || status === 429 || Boolean(resetTime);

      if (isRateLimit) {
        const resetMsg = resetTime ? ` Resets at ${resetTime}.` : "";
        throw new GitHubClientError(
          `GitHub API rate limit exceeded for repository '${coords.owner}/${coords.repo}'.${resetMsg}`,
          {
            statusCode: status,
            isRateLimit: true,
            resetTime,
          },
        );
      }

      throw new GitHubClientError(
        `Access forbidden to repository '${coords.owner}/${coords.repo}' (HTTP 403). Check your token permissions.`,
        { statusCode: 403 },
      );
    }

    throw new GitHubClientError(
      `GitHub API returned error for '${coords.owner}/${coords.repo}': HTTP ${status} ${response.statusText}`,
      { statusCode: status },
    );
  }
}
