import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerFindStarterIssuesTool } from "./tools/findStarterIssues.js";
import type { GitHubClient } from "./github/client.js";

export const ServerConfigSchema = z.object({
  name: z.string().min(1).default("repopilot-mcp"),
  version: z.string().min(1).default("0.1.0"),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export interface CreateServerOptions extends Partial<ServerConfig> {
  gitHubClient?: GitHubClient;
}

/**
 * Creates and initializes the RepoPilot MCP Server instance.
 * Validates configuration at runtime using Zod and registers tools.
 */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = ServerConfigSchema.parse({
    name: options.name,
    version: options.version,
  });

  const server = new McpServer({
    name: config.name,
    version: config.version,
  });

  registerFindStarterIssuesTool(server, options.gitHubClient);

  return server;
}
