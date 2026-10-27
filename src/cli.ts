#!/usr/bin/env node
import process from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down RepoPilot MCP server...`);
    try {
      await server.close();
      logger.info("Server closed successfully.");
      process.exit(0);
    } catch (error) {
      logger.error("Error during server shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  logger.info("Starting RepoPilot MCP server on stdio transport...");
  await server.connect(transport);
  logger.info("RepoPilot MCP server connected and listening.");
}

main().catch((error: unknown) => {
  logger.error("Fatal error running RepoPilot MCP server:", error);
  process.exit(1);
});
