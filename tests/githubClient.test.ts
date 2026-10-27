import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GitHubClient,
  GitHubClientError,
  GitHubTimeoutError,
  GitHubValidationError,
  parseRepoIdentifier,
  validateOwnerRepo,
} from "../src/github/client.js";

const fixturesDir = join(__dirname, "fixtures");
const rawIssuesFixture = JSON.parse(readFileSync(join(fixturesDir, "githubIssues.json"), "utf8"));

describe("GitHubClient validation", () => {
  it("accepts valid owner and repo names", () => {
    expect(validateOwnerRepo("octocat", "Hello-World")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    });
    expect(validateOwnerRepo("adity0208", "repopilot-mcp")).toEqual({
      owner: "adity0208",
      repo: "repopilot-mcp",
    });
    expect(validateOwnerRepo("facebook", "react.native_core-1")).toEqual({
      owner: "facebook",
      repo: "react.native_core-1",
    });
  });

  it("rejects '.' and '..' for repo name", () => {
    expect(() => validateOwnerRepo("octocat", ".")).toThrow(GitHubValidationError);
    expect(() => validateOwnerRepo("octocat", "..")).toThrow(GitHubValidationError);
  });

  it("rejects invalid characters and illegal lengths", () => {
    expect(() => validateOwnerRepo("octocat", "")).toThrow(GitHubValidationError);
    expect(() => validateOwnerRepo("", "repo")).toThrow(GitHubValidationError);
    expect(() => validateOwnerRepo("invalid/owner", "repo")).toThrow(GitHubValidationError);
    expect(() => validateOwnerRepo("octocat", "invalid/repo")).toThrow(GitHubValidationError);
    expect(() => validateOwnerRepo("a".repeat(40), "repo")).toThrow(GitHubValidationError);
    expect(() => validateOwnerRepo("owner", "b".repeat(101))).toThrow(GitHubValidationError);
  });

  it("parses owner/repo identifiers correctly", () => {
    expect(parseRepoIdentifier("octocat/Hello-World")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    });
    expect(() => parseRepoIdentifier("octocat")).toThrow(GitHubValidationError);
    expect(() => parseRepoIdentifier("octocat/repo/extra")).toThrow(GitHubValidationError);
  });
});

describe("GitHubClient REST calls and PR filtering", () => {
  it("fetches open issues and filters out pull requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => rawIssuesFixture,
      headers: new Headers(),
    });

    const client = new GitHubClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      token: "secret-token",
    });

    const issues = await client.fetchOpenIssues("octocat", "Hello-World");

    // The fixture contains 7 items: 5 issues (#1, #3, #4, #5, #7) and 2 PRs (#2, #6)
    expect(issues.length).toBe(5);
    expect(issues.map((i) => i.number)).toEqual([1, 3, 4, 5, 7]);

    // Ensure PRs #2 and #6 were filtered out
    expect(issues.find((i) => i.number === 2)).toBeUndefined();
    expect(issues.find((i) => i.number === 6)).toBeUndefined();

    // Verify fetch parameters and headers
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("https://api.github.com/repos/octocat/Hello-World/issues?");
    expect(calledUrl).toContain("state=open");
    expect(calledUrl).toContain("page=1");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer secret-token",
    );
  });
});

describe("GitHubClient error mappings", () => {
  it("maps 404 status to repository not found or private message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers(),
    });

    const client = new GitHubClient({ fetchFn: mockFetch as unknown as typeof fetch });

    await expect(client.fetchOpenIssues("octocat", "private-repo")).rejects.toThrow(
      "Repository 'octocat/private-repo' not found or is private.",
    );
  });

  it("maps 403/429 rate limit errors and extracts reset time from headers", async () => {
    const resetEpoch = 1700000000;
    const expectedIso = new Date(resetEpoch * 1000).toISOString();
    const headers = new Headers({
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(resetEpoch),
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      headers,
    });

    const client = new GitHubClient({ fetchFn: mockFetch as unknown as typeof fetch });

    try {
      await client.fetchOpenIssues("octocat", "Hello-World");
      expect.fail("Expected GitHubClientError to be thrown");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GitHubClientError);
      const clientErr = err as GitHubClientError;
      expect(clientErr.isRateLimit).toBe(true);
      expect(clientErr.resetTime).toBe(expectedIso);
      expect(clientErr.message).toContain("rate limit exceeded");
      expect(clientErr.message).toContain(expectedIso);
    }
  });

  it("maps standard 403 forbidden without rate limit", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      headers: new Headers({ "x-ratelimit-remaining": "50" }),
    });

    const client = new GitHubClient({ fetchFn: mockFetch as unknown as typeof fetch });

    await expect(client.fetchOpenIssues("octocat", "forbidden-repo")).rejects.toThrow(
      "Access forbidden to repository 'octocat/forbidden-repo' (HTTP 403).",
    );
  });

  it("maps timeout errors cleanly", async () => {
    const timeoutErr = new Error("The operation was aborted");
    timeoutErr.name = "TimeoutError";

    const mockFetch = vi.fn().mockRejectedValue(timeoutErr);
    const client = new GitHubClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      timeoutMs: 10_000,
    });

    await expect(client.fetchOpenIssues("octocat", "Hello-World")).rejects.toThrow(
      GitHubTimeoutError,
    );
  });

  it("maps generic network errors cleanly", async () => {
    const networkErr = new Error("Failed to connect to host");
    const mockFetch = vi.fn().mockRejectedValue(networkErr);
    const client = new GitHubClient({ fetchFn: mockFetch as unknown as typeof fetch });

    await expect(client.fetchOpenIssues("octocat", "Hello-World")).rejects.toThrow(
      "Network error connecting to GitHub API: Failed to connect to host",
    );
  });
});

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const issue = (number: number, extra: Record<string, unknown> = {}) => ({
  id: number,
  number,
  title: `Issue ${number}`,
  body: "body",
  html_url: `https://github.com/octocat/Hello-World/issues/${number}`,
  state: "open",
  labels: [],
  assignee: null,
  assignees: [],
  comments: 0,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-20T00:00:00Z",
  closed_at: null,
  ...extra,
});

const labelOf = (url: unknown) => new URL(String(url)).searchParams.get("labels");

describe("GitHubClient starter candidate fetching", () => {
  it("requests each starter label server-side", async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json([]));
    const client = new GitHubClient({ token: "t", fetchFn });

    await client.fetchStarterCandidates("octocat", "Hello-World");

    const labels = fetchFn.mock.calls.map(([url]) => labelOf(url));
    expect(labels).toContain("good first issue");
    expect(labels).toContain("help wanted");
  });

  it("dedupes an issue that carries both labels", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      const labels = labelOf(url);
      if (labels === "good first issue") return json([issue(1), issue(2)]);
      if (labels === "help wanted") return json([issue(2), issue(3)]);
      return json([]);
    });
    const client = new GitHubClient({ token: "t", fetchFn });

    const result = await client.fetchStarterCandidates("octocat", "Hello-World");

    expect(result.map((i) => i.number).sort()).toEqual([1, 2, 3]);
  });

  it("filters pull requests out of labeled results", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (labelOf(url) === "good first issue") {
        return json([issue(1), issue(2, { pull_request: { url: "https://example.test/pr/2" } })]);
      }
      return json([]);
    });
    const client = new GitHubClient({ token: "t", fetchFn });

    const result = await client.fetchStarterCandidates("octocat", "Hello-World");

    expect(result.map((i) => i.number)).toEqual([1]);
  });

  it("does not call the fallback when labeled issues exist", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      return labelOf(url) === "good first issue" ? json([issue(1)]) : json([]);
    });
    const client = new GitHubClient({ token: "t", fetchFn });

    await client.fetchStarterCandidates("octocat", "Hello-World");

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("calls the fallback without a labels param when both labeled queries are empty", async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json([]));
    const client = new GitHubClient({ token: "t", fetchFn });

    await client.fetchStarterCandidates("octocat", "Hello-World");

    expect(fetchFn).toHaveBeenCalledTimes(3);
    const thirdUrl = new URL(String(fetchFn.mock.calls[2]?.[0]));
    expect(thirdUrl.searchParams.has("labels")).toBe(false);
  });

  it("propagates a rate-limit error from a labeled request", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (labelOf(url) === "help wanted") {
        return new Response("{}", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000000" },
        });
      }
      return json([issue(1)]);
    });
    const client = new GitHubClient({ token: "t", fetchFn });

    await expect(client.fetchStarterCandidates("octocat", "Hello-World")).rejects.toThrow(
      "rate limit exceeded",
    );
  });
});
