import { describe, it, expect, beforeEach, vi } from "vitest";
import { RedmineServer } from "../../../src/redmine/redmine-server";
import * as http from "http";
import { EventEmitter } from "events";
import { QuickUpdate } from "../../../src/controllers/domain";
import { IssueStatus } from "../../../src/controllers/domain";
import { Membership } from "../../../src/controllers/domain";

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
          const path = options.path || "/";
          const response = new EventEmitter() as NodeJS.EventEmitter & {
            statusCode: number;
            statusMessage: string;
          };
          response.statusCode = 200;
          response.statusMessage = "OK";

          setTimeout(() => {
            let data: unknown;

            if (options.method === "GET" && path.includes("/issues.json")) {
              data = {
                issues: [
                  {
                    id: 123,
                    subject: "Test issue",
                    status: { id: 1, name: "New" },
                    tracker: { id: 1, name: "Bug" },
                    author: { id: 1, name: "John Doe" },
                    project: { id: 1, name: "Test Project" },
                    assigned_to: { id: 1, name: "John Doe" },
                  },
                ],
                total_count: 1,
              };
            } else if (path.match(/\/issues\/(\d+)\.json/)) {
              const issueId = parseInt(path.match(/\/issues\/(\d+)\.json/)![1]);
              if (options.method === "GET") {
                // Issue 999: wrong assignee (returns id 1 instead of requested)
                // Issue 998: wrong status (returns id 1 instead of requested)
                const assigned_to =
                  issueId === 999
                    ? { id: 1, name: "John Doe" }
                    : { id: 2, name: "Jane Doe" };
                const status =
                  issueId === 998
                    ? { id: 1, name: "New" }
                    : { id: 2, name: "In Progress" };

                data = {
                  issue: {
                    id: issueId,
                    subject: "Test issue",
                    status:
                      issueId === 123 ? { id: 1, name: "New" } : status,
                    tracker: { id: 1, name: "Bug" },
                    author: { id: 1, name: "John Doe" },
                    project: { id: 1, name: "Test Project" },
                    assigned_to:
                      issueId === 123
                        ? { id: 1, name: "John Doe" }
                        : assigned_to,
                  },
                };
              } else if (options.method === "PUT") {
                data = { success: true };
              }
            } else if (
              options.method === "GET" &&
              path.includes("/projects.json")
            ) {
              // Parse offset from query string
              const offsetMatch = path.match(/offset=(\d+)/);
              const offset = offsetMatch ? parseInt(offsetMatch[1]) : 0;
              const limitMatch = path.match(/limit=(\d+)/);
              const limit = limitMatch ? parseInt(limitMatch[1]) : 50;

              // Return 3 projects across 2 pages (2 on first, 1 on second)
              const allProjects = [
                { id: 1, name: "Project One", identifier: "proj1" },
                { id: 2, name: "Project Two", identifier: "proj2" },
                { id: 3, name: "Project Three", identifier: "proj3" },
              ];
              const projects = allProjects.slice(offset, offset + limit);

              data = {
                projects,
                total_count: 3,
              };
            } else if (
              options.method === "GET" &&
              path.includes("/issue_statuses.json")
            ) {
              data = {
                issue_statuses: [
                  { id: 1, name: "New" },
                  { id: 2, name: "In Progress" },
                ],
              };
            } else if (
              options.method === "GET" &&
              path.includes("/time_entry_activities.json")
            ) {
              data = {
                time_entry_activities: [{ id: 9, name: "Development" }],
              };
            } else if (
              options.method === "GET" &&
              path.match(/\/projects\/\d+\/memberships\.json/)
            ) {
              data = {
                memberships: [{ user: { id: 1, name: "John Doe" } }],
              };
            } else if (
              options.method === "POST" &&
              path.includes("/time_entries.json")
            ) {
              data = { time_entry: { id: 1 } };
            } else {
              data = { error: "Not found" };
            }

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

describe("RedmineServer", () => {
  let server: RedmineServer;

  beforeEach(() => {
    server = new RedmineServer({
      address: "http://localhost:3000",
      key: "test-api-key",
    });
  });

  it("should fetch issues assigned to me", async () => {
    const result = await server.getIssuesAssignedToMe();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].subject).toBe("Test issue");
  });

  it("should update issue status", async () => {
    const issue = { id: 123 } as { id: number };
    await expect(server.setIssueStatus(issue, 2)).resolves.not.toThrow();
  });

  it("should add time entry", async () => {
    await expect(
      server.addTimeEntry(123, 9, "1.5", "Test work")
    ).resolves.not.toThrow();
  });

  it("should fetch projects", async () => {
    const projects = await server.getProjects();
    expect(projects).toHaveLength(3);
    expect(projects[0].toQuickPickItem().label).toBe("Project One");
  });

  it("should fetch issue by id", async () => {
    const result = await server.getIssueById(123);
    expect(result.issue.id).toBe(123);
    expect(result.issue.subject).toBe("Test issue");
  });

  it("should fetch issue statuses", async () => {
    const result = await server.getIssueStatuses();
    expect(result.issue_statuses).toHaveLength(2);
    expect(result.issue_statuses[0].name).toBe("New");
  });

  it("should cache issue statuses", async () => {
    await server.getIssueStatuses();
    const result = await server.getIssueStatuses();
    expect(result.issue_statuses).toHaveLength(2);
  });

  it("should fetch time entry activities", async () => {
    const result = await server.getTimeEntryActivities();
    expect(result.time_entry_activities).toHaveLength(1);
    expect(result.time_entry_activities[0].name).toBe("Development");
  });

  it("should cache time entry activities", async () => {
    await server.getTimeEntryActivities();
    const result = await server.getTimeEntryActivities();
    expect(result.time_entry_activities).toHaveLength(1);
  });

  it("should fetch memberships", async () => {
    const memberships = await server.getMemberships(1);
    expect(memberships).toHaveLength(1);
    expect(memberships[0].name).toBe("John Doe");
    expect(memberships[0].isUser).toBe(true);
  });

  it("should fetch typed issue statuses", async () => {
    const statuses = await server.getIssueStatusesTyped();
    expect(statuses).toHaveLength(2);
    expect(statuses[0].name).toBe("New");
  });

  it("should fetch open issues for project", async () => {
    const result = await server.getOpenIssuesForProject(1, true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].id).toBe(123);
  });

  it("should fetch open issues for project without subprojects", async () => {
    const result = await server.getOpenIssuesForProject(1, false);
    expect(result.issues).toHaveLength(1);
  });

  it("should compare servers correctly", () => {
    const server2 = new RedmineServer({
      address: "http://localhost:3000",
      key: "test-api-key",
    });
    expect(server.compare(server2)).toBe(true);

    const server3 = new RedmineServer({
      address: "http://localhost:3001",
      key: "test-api-key",
    });
    expect(server.compare(server3)).toBe(false);
  });

  it("should detect assignee update failure in applyQuickUpdate", async () => {
    const quickUpdate = new QuickUpdate(
      999,
      new IssueStatus(2, "In Progress"),
      new Membership(2, "Jane Doe"),
      "Update note"
    );
    const result = await server.applyQuickUpdate(quickUpdate);
    expect(result.differences).toContain("Couldn't assign user");
  });

  it("should detect status update failure in applyQuickUpdate", async () => {
    const quickUpdate = new QuickUpdate(
      998,
      new IssueStatus(2, "In Progress"),
      new Membership(2, "Jane Doe"),
      "Update note"
    );
    const result = await server.applyQuickUpdate(quickUpdate);
    expect(result.differences).toContain("Couldn't update status");
  });

  it("should fetch all projects with pagination", async () => {
    const projects = await server.getProjects();
    expect(projects).toHaveLength(3);
    expect(projects[0].toQuickPickItem().label).toBe("Project One");
    expect(projects[1].toQuickPickItem().label).toBe("Project Two");
    expect(projects[2].toQuickPickItem().label).toBe("Project Three");
  });
});
