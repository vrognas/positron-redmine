import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { execSync } from "child_process";
import { unlinkSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir, platform } from "os";

const SCRIPTS_DIR = join(__dirname, "../../../scripts/hooks");
const isWindows = platform() === "win32";

// These hooks only run in Claude Code Web (Linux) - skip on Windows
describe.skipIf(isWindows)("context-inject hook", () => {
  const HOOK_PATH = join(SCRIPTS_DIR, "context-inject.sh");

  it("should output git branch info", () => {
    const result = execSync(`bash ${HOOK_PATH}`, {
      encoding: "utf8",
      cwd: join(__dirname, "../../.."), // project root (git repo)
    });
    expect(result).toContain("Branch:");
  });

  it("should output uncommitted changes count", () => {
    const result = execSync(`bash ${HOOK_PATH}`, {
      encoding: "utf8",
      cwd: join(__dirname, "../../.."),
    });
    expect(result).toContain("Uncommitted:");
  });

  it("should exit 0 (non-blocking)", () => {
    // execSync throws on non-zero exit
    const result = execSync(`bash ${HOOK_PATH}; echo "exit:$?"`, {
      encoding: "utf8",
      cwd: join(__dirname, "../../.."),
    });
    expect(result).toContain("exit:0");
  });
});

// These hooks only run in Claude Code Web (Linux) - skip on Windows
describe.skipIf(isWindows)("pre-compact-log hook", () => {
  const HOOK_PATH = join(SCRIPTS_DIR, "pre-compact-log.sh");
  const LOG_DIR = join(tmpdir(), "claude-test-" + Date.now());
  const LOG_FILE = join(LOG_DIR, "compaction-log.txt");

  beforeEach(() => {
    mkdirSync(LOG_DIR, { recursive: true });
  });

  afterEach(() => {
    try {
      unlinkSync(LOG_FILE);
    } catch {
      // ignore
    }
  });

  it("should create log entry with timestamp", () => {
    execSync(`CLAUDE_LOG_DIR="${LOG_DIR}" bash ${HOOK_PATH}`, {
      encoding: "utf8",
    });
    expect(existsSync(LOG_FILE)).toBe(true);
    const content = readFileSync(LOG_FILE, "utf8");
    expect(content).toContain("Context compaction");
  });

  it("should exit 0 (non-blocking)", () => {
    const result = execSync(`CLAUDE_LOG_DIR="${LOG_DIR}" bash ${HOOK_PATH}; echo "exit:$?"`, {
      encoding: "utf8",
    });
    expect(result).toContain("exit:0");
  });
});
