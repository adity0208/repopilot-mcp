import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import process from "node:process";
import { StderrLogger } from "../src/logger.js";

describe("StderrLogger", () => {
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrWriteSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes all log messages to process.stderr and never to process.stdout", () => {
    const logger = new StderrLogger({ level: "debug" });

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(stderrWriteSpy).toHaveBeenCalledTimes(4);
    expect(stdoutWriteSpy).not.toHaveBeenCalled();

    const loggedLines = stderrWriteSpy.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(loggedLines[0]).toContain("[DEBUG] debug message\n");
    expect(loggedLines[1]).toContain("[INFO] info message\n");
    expect(loggedLines[2]).toContain("[WARN] warn message\n");
    expect(loggedLines[3]).toContain("[ERROR] error message\n");
  });

  it("filters out messages below the active log level", () => {
    const logger = new StderrLogger({ level: "warn" });

    logger.debug("hidden debug");
    logger.info("hidden info");
    expect(stderrWriteSpy).not.toHaveBeenCalled();

    logger.warn("visible warning");
    logger.error("visible error");
    expect(stderrWriteSpy).toHaveBeenCalledTimes(2);
  });

  it("supports dynamic log level adjustment", () => {
    const logger = new StderrLogger({ level: "info" });

    logger.debug("skipped debug");
    expect(stderrWriteSpy).not.toHaveBeenCalled();

    logger.setLevel("debug");
    expect(logger.getLevel()).toBe("debug");

    logger.debug("now visible debug");
    expect(stderrWriteSpy).toHaveBeenCalledTimes(1);
  });

  it("formats log messages with timestamp, prefix, and extra arguments", () => {
    const logger = new StderrLogger({ prefix: "custom-prefix", level: "info" });
    logger.info("test formatting", { extra: 123 });

    expect(stderrWriteSpy).toHaveBeenCalledTimes(1);
    const output = stderrWriteSpy.mock.calls[0]?.[0] as string;
    expect(output).toMatch(
      /\[\d{4}-\d{2}-\d{2}T.*\] \[custom-prefix\] \[INFO\] test formatting \{ extra: 123 \}\n/,
    );
  });
});
