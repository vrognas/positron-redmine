import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { RedmineSecretManager } from "../../../src/utilities/secret-manager";

describe("RedmineSecretManager", () => {
  let context: vscode.ExtensionContext;
  let manager: RedmineSecretManager;

  beforeEach(() => {
    context = {
      secrets: {
        get: vi.fn(),
        store: vi.fn(),
        delete: vi.fn(),
        onDidChange: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;

    manager = new RedmineSecretManager(context);
  });

  it("should store API key", async () => {
    const uri = vscode.Uri.parse("file:///home/user/project");
    await manager.setApiKey(uri, "test-key-123");

    expect(context.secrets.store).toHaveBeenCalledWith(
      expect.stringContaining("redmine:"),
      "test-key-123"
    );
  });

  it("should retrieve API key", async () => {
    const uri = vscode.Uri.parse("file:///home/user/project");
    vi.mocked(context.secrets.get).mockResolvedValue("test-key-123");

    const key = await manager.getApiKey(uri);
    expect(key).toBe("test-key-123");
  });

  it("should delete API key", async () => {
    const uri = vscode.Uri.parse("file:///home/user/project");
    await manager.deleteApiKey(uri);

    expect(context.secrets.delete).toHaveBeenCalledWith(
      expect.stringContaining("redmine:")
    );
  });

  it("should handle getApiKey error", async () => {
    const uri = vscode.Uri.parse("file:///home/user/project");
    vi.mocked(context.secrets.get).mockRejectedValue(new Error("Storage error"));
    const showErrorSpy = vi.spyOn(vscode.window, "showErrorMessage");

    const key = await manager.getApiKey(uri);

    expect(key).toBeUndefined();
    expect(showErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to retrieve API key")
    );
  });

  it("should trigger callback for redmine key changes", () => {
    const callback = vi.fn();
    const mockListener = vi.fn();
    vi.mocked(context.secrets.onDidChange).mockImplementation((handler) => {
      mockListener.mockImplementation(handler);
      return { dispose: vi.fn() };
    });

    manager.onSecretChanged(callback);
    mockListener({ key: "redmine:test:apiKey:v1" });

    expect(callback).toHaveBeenCalledWith("redmine:test:apiKey:v1");
  });

  it("should not trigger callback for non-redmine key changes", () => {
    const callback = vi.fn();
    const mockListener = vi.fn();
    vi.mocked(context.secrets.onDidChange).mockImplementation((handler) => {
      mockListener.mockImplementation(handler);
      return { dispose: vi.fn() };
    });

    manager.onSecretChanged(callback);
    mockListener({ key: "other:test:key" });

    expect(callback).not.toHaveBeenCalled();
  });
});
