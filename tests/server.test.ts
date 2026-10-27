import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer, ServerConfigSchema } from "../src/server.js";

describe("RepoPilot MCP Server Foundation", () => {
  it("creates an McpServer instance with default configuration", () => {
    const server = createServer();

    expect(server).toBeInstanceOf(McpServer);
    expect(typeof server.connect).toBe("function");
    expect(typeof server.close).toBe("function");
    expect(typeof server.tool).toBe("function");
    expect(typeof server.resource).toBe("function");
    expect(typeof server.prompt).toBe("function");
  });

  it("creates an McpServer with custom configuration and registers find_starter_issues tool", () => {
    const server = createServer({
      name: "custom-repopilot",
      version: "1.0.0",
    });

    expect(server).toBeInstanceOf(McpServer);
    const registeredTools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(registeredTools["find_starter_issues"]).toBeDefined();
  });

  it("validates server configuration using Zod", () => {
    const validConfig = ServerConfigSchema.parse({
      name: "valid-name",
      version: "0.2.0",
    });
    expect(validConfig.name).toBe("valid-name");
    expect(validConfig.version).toBe("0.2.0");

    expect(() => {
      ServerConfigSchema.parse({
        name: "",
      });
    }).toThrow(ZodError);
  });
});
