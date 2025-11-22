import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProjectsTree, ProjectsViewStyle } from "../../src/trees/projects-tree";
import { RedmineServer } from "../../src/redmine/redmine-server";
import { RedmineProject } from "../../src/redmine/redmine-project";
import { Issue } from "../../src/redmine/models/issue";
import * as vscode from "vscode";

vi.mock("vscode", () => ({
  EventEmitter: class {
    fire = vi.fn();
    event = vi.fn();
  },
  TreeItem: class {
    constructor(
      public label: string,
      public collapsibleState: number
    ) {}
    command?: { command: string; arguments: unknown[]; title: string };
  },
  TreeItemCollapsibleState: { Collapsed: 1, None: 0 },
}));

describe("ProjectsTree E2E Workflow", () => {
  let tree: ProjectsTree;
  let mockServer: RedmineServer;
  let parentProject: RedmineProject;
  let childProject: RedmineProject;
  let flatProject: RedmineProject;
  let mockIssue: Issue;

  beforeEach(() => {
    // Create mock server
    mockServer = {
      getProjects: vi.fn(),
      getOpenIssuesForProject: vi.fn(),
    } as unknown as RedmineServer;

    // Create projects with hierarchy
    parentProject = new RedmineProject(mockServer, {
      id: 1,
      name: "Parent Project",
      description: "Parent desc",
      identifier: "parent",
    });

    childProject = new RedmineProject(mockServer, {
      id: 2,
      name: "Child Project",
      description: "Child desc",
      identifier: "child",
      parent: { id: 1, name: "Parent Project" },
    });

    flatProject = new RedmineProject(mockServer, {
      id: 3,
      name: "Standalone Project",
      description: "Flat desc",
      identifier: "standalone",
    });

    // Create mock issue
    mockIssue = {
      id: 101,
      subject: "Test Issue",
      status: { id: 1, name: "New" },
      tracker: { id: 1, name: "Bug" },
      author: { id: 1, name: "John Doe" },
      project: { id: 1, name: "Parent Project" },
      assigned_to: { id: 1, name: "John Doe" },
    } as Issue;

    // Mock server methods
    vi.mocked(mockServer.getProjects).mockResolvedValue([
      parentProject,
      childProject,
      flatProject,
    ]);
    vi.mocked(mockServer.getOpenIssuesForProject).mockResolvedValue({
      issues: [mockIssue],
      total_count: 1,
    });

    // Create tree
    tree = new ProjectsTree();
    tree.setServer(mockServer);
  });

  it("should load projects in LIST mode and expand to show issues", async () => {
    // Load root projects (LIST mode default)
    const projects = await tree.getChildren();

    expect(projects).toHaveLength(3);
    expect(projects[0]).toBe(parentProject);
    expect(projects[1]).toBe(childProject);
    expect(projects[2]).toBe(flatProject);
    expect(mockServer.getProjects).toHaveBeenCalledOnce();

    // Expand parent project to show issues
    const children = await tree.getChildren(parentProject);

    expect(children).toHaveLength(1);
    expect(children[0]).toBe(mockIssue);
    expect(mockServer.getOpenIssuesForProject).toHaveBeenCalledWith(1);
  });

  it("should switch to TREE mode, handle hierarchy, and refresh", async () => {
    // Switch to TREE mode
    tree.setViewStyle(ProjectsViewStyle.TREE);

    expect(tree.viewStyle).toBe(ProjectsViewStyle.TREE);
    expect(tree.onDidChangeTreeData$.fire).toHaveBeenCalled();

    // Load root projects (only parents in TREE mode)
    const rootProjects = await tree.getChildren();

    expect(rootProjects).toHaveLength(2); // parentProject, flatProject
    expect(rootProjects).toContain(parentProject);
    expect(rootProjects).toContain(flatProject);
    expect(rootProjects).not.toContain(childProject);

    // Expand parent to show child projects + issues
    const parentChildren = await tree.getChildren(parentProject);

    expect(parentChildren).toHaveLength(2); // childProject + mockIssue
    expect(parentChildren[0]).toBe(childProject);
    expect(parentChildren[1]).toBe(mockIssue);
    expect(mockServer.getOpenIssuesForProject).toHaveBeenCalledWith(1, false);

    // Refresh tree data
    tree.clearProjects();
    expect(tree.projects).toEqual([]);

    // Reload after refresh
    await tree.getChildren();
    expect(mockServer.getProjects).toHaveBeenCalledTimes(2);
  });

  it("should integrate with tree provider interface correctly", async () => {
    // Test getTreeItem for project
    const projectItem = tree.getTreeItem(parentProject);

    expect(projectItem).toBeInstanceOf(vscode.TreeItem);
    expect(projectItem.label).toBe("Parent Project");
    expect(projectItem.collapsibleState).toBe(
      vscode.TreeItemCollapsibleState.Collapsed
    );

    // Test getTreeItem for issue
    const issueItem = tree.getTreeItem(mockIssue);

    expect(issueItem).toBeInstanceOf(vscode.TreeItem);
    expect(issueItem.label).toBe(
      "#101 [Bug] (New) Test Issue by John Doe"
    );
    expect(issueItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
    expect(issueItem.command?.command).toBe("redmine.openActionsForIssue");
    expect(issueItem.command?.arguments).toEqual([
      false,
      { server: mockServer },
      "101",
    ]);

    // Test event emitter
    expect(tree.onDidChangeTreeData).toBeDefined();

    // Test no server returns empty
    tree.setServer(undefined);
    const empty = await tree.getChildren();
    expect(empty).toEqual([]);
  });
});
