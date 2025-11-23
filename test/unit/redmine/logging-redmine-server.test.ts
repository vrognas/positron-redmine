import { describe, it, expect, beforeEach, vi } from "vitest";
import type * as vscode from "vscode";
import { LoggingRedmineServer } from "../../../src/redmine/logging-redmine-server";
import * as http from "http";
import { EventEmitter } from "events";

// Mock http.request
vi.mock("http", async () => {
  const actual = await vi.importActual<typeof http>("http");
  return {
    ...actual,
    request: vi.fn(
      (
        options: { path?: string; method?: string },
        callback: (
          response: NodeJS.EventEmitter & {
            statusCode: number;
            statusMessage: string;
          }
        ) => void
      ) => {
        const request = new EventEmitter() as NodeJS.EventEmitter & {
          end: () => void;
          on: (event: string, handler: (...args: unknown[]) => void) => unknown;
        };
        request.end = function () {
          const response = new EventEmitter() as NodeJS.EventEmitter & {
            statusCode: number;
            statusMessage: string;
          };
          response.statusCode = 200;
          response.statusMessage = "OK";

          setTimeout(() => {
            const data = { issues: [], total_count: 0 };
            response.emit("data", Buffer.from(JSON.stringify(data)));
            response.emit("end");
          }, 10);

          callback(response);
        };
        request.on = function () {
          return this;
        };
        return request;
      }
    ),
  };
});

describe("LoggingRedmineServer", () => {
  let mockChannel: { appendLine: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockChannel = { appendLine: vi.fn() };
  });

  it("logs when enabled", async () => {
    const server = new LoggingRedmineServer(
      {
        address: "http://localhost",
        key: "test-key",
        rejectUnauthorized: false,
        additionalHeaders: {},
      },
      mockChannel as unknown as vscode.OutputChannel,
      { enabled: true }
    );

    await server.getIssuesAssignedToMe();

    expect(mockChannel.appendLine).toHaveBeenCalled();
    expect(mockChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("GET")
    );
    expect(mockChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("200")
    );
  });

  it("silent when disabled", async () => {
    const server = new LoggingRedmineServer(
      {
        address: "http://localhost",
        key: "test-key",
        rejectUnauthorized: false,
        additionalHeaders: {},
      },
      mockChannel as unknown as vscode.OutputChannel,
      { enabled: false }
    );

    await server.getIssuesAssignedToMe();

    expect(mockChannel.appendLine).not.toHaveBeenCalled();
  });

  it("logs errors", async () => {
    const server = new LoggingRedmineServer(
      {
        address: "http://localhost",
        key: "test-key",
        rejectUnauthorized: false,
        additionalHeaders: {},
      },
      mockChannel as unknown as vscode.OutputChannel,
      { enabled: true }
    );

    // Mock request to throw error
    vi.mocked(http.request).mockImplementationOnce(
      (
        _options: unknown,
        _callback: (response: NodeJS.EventEmitter) => void
      ): http.ClientRequest => {
        const request = new EventEmitter() as http.ClientRequest & {
          end: () => void;
          on: (event: string, handler: (...args: unknown[]) => void) => unknown;
        };
        request.end = () => {
          request.emit("error", new Error("Network error"));
        };
        request.on = function () {
          return this;
        };
        return request;
      }
    );

    await expect(server.getIssuesAssignedToMe()).rejects.toThrow(
      "Network error"
    );

    expect(mockChannel.appendLine).toHaveBeenCalled();
    expect(mockChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("ERROR")
    );
  });
});
