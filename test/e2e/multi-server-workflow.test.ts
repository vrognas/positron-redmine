import { describe, it, expect, beforeEach, vi } from "vitest";
import { RedmineServer } from "../../src/redmine/redmine-server";
import * as http from "http";
import { EventEmitter } from "events";

// Mock http.request for RedmineServer
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
            const data = { success: true };
            response.emit("data", Buffer.from(JSON.stringify(data)));
            response.emit("end");
          }, 0);

          callback(response);
        };
        request.on = function (
          event: string,
          handler: (...args: unknown[]) => void
        ) {
          EventEmitter.prototype.on.call(this, event, handler);
          return this;
        };
        return request;
      }
    ),
  };
});

// Mock vscode module
vi.mock("vscode", () => ({
  EventEmitter: class {
    fire = vi.fn();
    event = vi.fn();
  },
  window: {
    createTreeView: vi.fn(),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
    })),
    workspaceFolders: [],
    onDidChangeConfiguration: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
    registerCommand: vi.fn(),
  },
  ConfigurationTarget: { Global: 1 },
}));

describe("Multi-server workflow", () => {
  let bucket: { servers: RedmineServer[] };

  beforeEach(() => {
    bucket = { servers: [] };
    vi.clearAllMocks();
  });

  it("should cache identical servers in bucket and create new for different configs", () => {
    // Create server 1
    const server1 = new RedmineServer({
      address: "http://localhost:3000",
      key: "key1",
    });

    // Add to bucket
    bucket.servers.push(server1);

    // Create identical server
    const server2 = new RedmineServer({
      address: "http://localhost:3000",
      key: "key1",
    });

    // Simulate parseConfiguration bucket logic
    const fromBucket = bucket.servers.find((s) => s.compare(server2));
    const cachedServer = fromBucket || server2;

    // Should reuse cached server
    expect(fromBucket).toBe(server1);
    expect(cachedServer).toBe(server1);
    expect(bucket.servers).toHaveLength(1);

    // Create different server
    const server3 = new RedmineServer({
      address: "http://localhost:3001",
      key: "key1",
    });

    const fromBucket2 = bucket.servers.find((s) => s.compare(server3));
    const newServer = fromBucket2 || server3;

    // Should not find in bucket
    expect(fromBucket2).toBeUndefined();
    expect(newServer).toBe(server3);

    // Add to bucket
    if (!fromBucket2) {
      bucket.servers.push(newServer);
    }

    expect(bucket.servers).toHaveLength(2);
    expect(bucket.servers[0]).toBe(server1);
    expect(bucket.servers[1]).toBe(server3);
  });

  it("should compare servers correctly and switch between them", () => {
    // Create multiple servers
    const server1 = new RedmineServer({
      address: "http://server1.com",
      key: "key1",
    });

    const server2 = new RedmineServer({
      address: "http://server2.com",
      key: "key2",
    });

    const server3 = new RedmineServer({
      address: "http://server1.com",
      key: "key1",
    });

    // Compare same config
    expect(server1.compare(server3)).toBe(true);
    expect(server3.compare(server1)).toBe(true);

    // Compare different configs
    expect(server1.compare(server2)).toBe(false);
    expect(server2.compare(server1)).toBe(false);

    // Different address
    expect(server1.compare(server2)).toBe(false);

    // Different key
    const server4 = new RedmineServer({
      address: "http://server1.com",
      key: "different-key",
    });
    expect(server1.compare(server4)).toBe(false);

    // Simulate tree switching (changeDefaultServer command)
    const currentServer = server1;
    const mockTree = {
      server: currentServer,
      setServer: (s: RedmineServer) => {
        mockTree.server = s;
      },
      refresh: vi.fn(),
    };

    // Switch to server2
    mockTree.setServer(server2);
    mockTree.refresh();

    expect(mockTree.server).toBe(server2);
    expect(mockTree.refresh).toHaveBeenCalledTimes(1);

    // Switch to server1 (identical to server3)
    mockTree.setServer(server3);
    mockTree.refresh();

    expect(mockTree.server).toBe(server3);
    expect(mockTree.refresh).toHaveBeenCalledTimes(2);
  });

  it("should handle config changes triggering server updates", async () => {
    // Simulate initial config
    let config = {
      url: "http://server1.com",
      apiKey: "key1",
    };

    // Create initial server
    const server = new RedmineServer({
      address: config.url,
      key: config.apiKey,
    });

    bucket.servers.push(server);

    // Mock tree state
    const mockTrees = {
      myIssuesTree: {
        server: server,
        setServer: vi.fn((s) => {
          mockTrees.myIssuesTree.server = s;
        }),
        refresh: vi.fn(),
      },
      projectsTree: {
        server: server,
        setServer: vi.fn((s) => {
          mockTrees.projectsTree.server = s;
        }),
        refresh: vi.fn(),
      },
    };

    expect(mockTrees.myIssuesTree.server).toBe(server);
    expect(mockTrees.projectsTree.server).toBe(server);

    // Simulate config change (updateConfiguredContext)
    config = {
      url: "http://server2.com",
      apiKey: "key2",
    };

    // Create new server based on changed config
    const newServer = new RedmineServer({
      address: config.url,
      key: config.apiKey,
    });

    // Check if server exists in bucket
    const fromBucket = bucket.servers.find((s) => s.compare(newServer));
    const activeServer = fromBucket || newServer;

    // New config should create new server
    expect(fromBucket).toBeUndefined();
    expect(activeServer).toBe(newServer);

    // Add to bucket
    if (!fromBucket) {
      bucket.servers.push(activeServer);
    }

    // Update trees (simulates changeDefaultServer)
    mockTrees.myIssuesTree.setServer(activeServer);
    mockTrees.projectsTree.setServer(activeServer);
    mockTrees.myIssuesTree.refresh();
    mockTrees.projectsTree.refresh();

    // Verify trees updated
    expect(mockTrees.myIssuesTree.setServer).toHaveBeenCalledWith(activeServer);
    expect(mockTrees.projectsTree.setServer).toHaveBeenCalledWith(activeServer);
    expect(mockTrees.myIssuesTree.refresh).toHaveBeenCalled();
    expect(mockTrees.projectsTree.refresh).toHaveBeenCalled();
    expect(mockTrees.myIssuesTree.server).toBe(newServer);
    expect(mockTrees.projectsTree.server).toBe(newServer);

    // Verify bucket contains both servers
    expect(bucket.servers).toHaveLength(2);
    expect(bucket.servers[0]).toBe(server);
    expect(bucket.servers[1]).toBe(newServer);
  });
});
