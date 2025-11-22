import { describe, it, expect, vi } from "vitest";
import { RedmineProject } from "../../../src/redmine/redmine-project";
import { RedmineServer } from "../../../src/redmine/redmine-server";

describe("RedmineProject", () => {
  const mockServer = {} as RedmineServer;

  it("should return id", () => {
    const project = new RedmineProject(mockServer, {
      id: 42,
      name: "Test Project",
      description: "",
      identifier: "test",
    });
    expect(project.id).toBe(42);
  });

  it("should return parent when present", () => {
    const parent = { id: 1, name: "Parent Project" };
    const project = new RedmineProject(mockServer, {
      id: 42,
      name: "Test Project",
      description: "",
      identifier: "test",
      parent,
    });
    expect(project.parent).toEqual(parent);
  });

  it("should return undefined parent when not present", () => {
    const project = new RedmineProject(mockServer, {
      id: 42,
      name: "Test Project",
      description: "",
      identifier: "test",
    });
    expect(project.parent).toBeUndefined();
  });

  it("should convert to QuickPickItem with empty description", () => {
    const project = new RedmineProject(mockServer, {
      id: 42,
      name: "Test Project",
      description: "",
      identifier: "test",
    });
    const item = project.toQuickPickItem();
    expect(item.label).toBe("Test Project");
    expect(item.description).toBe("");
    expect(item.detail).toBe("test");
    expect(item.identifier).toBe("test");
    expect(item.project).toBe(project);
  });

  it("should convert to QuickPickItem with newlines in description", () => {
    const project = new RedmineProject(mockServer, {
      id: 42,
      name: "Test Project",
      description: "Line 1\nLine 2\nLine 3",
      identifier: "test",
    });
    const item = project.toQuickPickItem();
    expect(item.description).toBe("Line 1 Line 2 Line 3");
  });

  it("should convert to QuickPickItem with \\r in description", () => {
    const project = new RedmineProject(mockServer, {
      id: 42,
      name: "Test Project",
      description: "Line 1\rLine 2\r\nLine 3",
      identifier: "test",
    });
    const item = project.toQuickPickItem();
    expect(item.description).toBe("Line 1Line 2 Line 3");
  });
});
