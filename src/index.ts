export {
  createServer,
  ServerConfigSchema,
  type ServerConfig,
  type CreateServerOptions,
} from "./server.js";

export { logger, StderrLogger, type LogLevel, type LoggerOptions } from "./logger.js";

export {
  GitHubClient,
  GitHubClientError,
  GitHubValidationError,
  GitHubTimeoutError,
  validateOwnerRepo,
  parseRepoIdentifier,
  type GitHubClientOptions,
} from "./github/client.js";

export type {
  GitHubIssue,
  GitHubLabel,
  GitHubUser,
  GitHubRawIssue,
  RepoCoordinates,
} from "./github/types.js";

export {
  analyzeStarterIssues,
  extractSignals,
  calculateScore,
  generateReasons,
  isStarterLabel,
} from "./analysis/starterIssues.js";

export type {
  CandidateStarterIssue,
  StarterIssueSignals,
  ConfidenceTier,
  AnalysisOptions,
} from "./analysis/types.js";

export {
  registerFindStarterIssuesTool,
  handleFindStarterIssues,
  formatStarterIssuesText,
  truncateText,
  wrapUntrusted,
  FindStarterIssuesInputSchema,
  type FindStarterIssuesArgs,
  type FindStarterIssuesResult,
} from "./tools/findStarterIssues.js";
