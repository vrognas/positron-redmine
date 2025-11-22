import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import listOpenIssues from "../../../src/commands/list-open-issues-assigned-to-me";
import { IssueController } from "../../../src/controllers/issue-controller";

vi.mock("vscode");
vi.mock("../../../src/controllers/issue-controller");

describe("listOpenIssuesAssignedToMe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.window.withProgress).mockImplementation(
      async (_options, callback) => callback({ report: vi.fn() } as vscode.Progress<{ message?: string; increment?: number }>)
    );
  });

  it("should fetch and display issues", async () => {
    const mockServer = {
      getIssuesAssignedToMe: vi.fn().mockResolvedValue({ issues: [] }),
      options: { url: { hostname: "test.redmine.com" } },
    };

    const props = { server: mockServer, config: {} };

    await listOpenIssues(props);

    expect(mockServer.getIssuesAssignedToMe).toHaveBeenCalled();
  });

  it("should not create controller when user cancels selection", async () => {
    const mockServer = {
      getIssuesAssignedToMe: vi.fn().mockResolvedValue({ issues: [] }),
      options: { url: { hostname: "test.redmine.com" } },
    };

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

    await listOpenIssues({ server: mockServer, config: {} });

    expect(IssueController).not.toHaveBeenCalled();
  });

  it("should show error message on server error", async () => {
    const mockServer = {
      getIssuesAssignedToMe: vi.fn().mockRejectedValue(new Error("Server error")),
      options: { url: { hostname: "test.redmine.com" } },
    };

    vi.mocked(vscode.window.showErrorMessage).mockResolvedValue(undefined);

    await listOpenIssues({ server: mockServer, config: {} });

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("Server error");
  });
});
