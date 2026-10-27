import process from "node:process";
import util from "node:util";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
}

export class StderrLogger {
  private level: LogLevel;
  private prefix: string;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.prefix = options.prefix ?? "repopilot-mcp";
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  private format(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.prefix}] [${level.toUpperCase()}] ${message}`;
  }

  /**
   * Writes strictly to process.stderr so stdout remains cleanly reserved for MCP JSON-RPC protocol transport.
   */
  private write(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }
    const header = this.format(level, message);
    const line = args.length > 0 ? `${header} ${util.format(...args)}\n` : `${header}\n`;
    process.stderr.write(line);
  }

  debug(message: string, ...args: unknown[]): void {
    this.write("debug", message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.write("info", message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.write("warn", message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.write("error", message, ...args);
  }
}

export const logger = new StderrLogger();
