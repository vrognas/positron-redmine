import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  calculateFlexibility,
  clearFlexibilityCache,
  type WeeklySchedule,
} from "../../../src/utilities/flexibility-calculator";

// Mock issue with all required fields for flexibility calculation
function createMockIssue(overrides: {
  start_date?: string;
  due_date?: string | null;
  estimated_hours?: number | null;
  spent_hours?: number;
}) {
  return {
    id: 123,
    subject: "Test Issue",
    project: { id: 1, name: "Project" },
    tracker: { id: 1, name: "Task" },
    status: { id: 1, name: "In Progress" },
    priority: { id: 2, name: "Normal" },
    author: { id: 1, name: "Author" },
    assigned_to: { id: 1, name: "Assignee" },
    description: "",
    done_ratio: 0,
    is_private: false,
    created_on: "2025-01-01T00:00:00Z",
    updated_on: "2025-01-01T00:00:00Z",
    closed_on: null,
    start_date: "start_date" in overrides ? overrides.start_date! : "2025-11-01",
    due_date: "due_date" in overrides ? overrides.due_date : "2025-11-30",
    estimated_hours: "estimated_hours" in overrides ? overrides.estimated_hours : 40,
    spent_hours: overrides.spent_hours ?? 0,
  };
}

const defaultSchedule: WeeklySchedule = {
  Mon: 8,
  Tue: 8,
  Wed: 8,
  Thu: 8,
  Fri: 8,
  Sat: 0,
  Sun: 0,
};

describe("calculateFlexibility", () => {
  beforeEach(() => {
    clearFlexibilityCache();
    vi.useFakeTimers();
  });

  it("returns null for issues without due_date or estimated_hours", () => {
    const noDueDate = createMockIssue({ due_date: null });
    const noEstimate = createMockIssue({ estimated_hours: null });

    expect(calculateFlexibility(noDueDate, defaultSchedule)).toBeNull();
    expect(calculateFlexibility(noEstimate, defaultSchedule)).toBeNull();
  });

  it("calculates flexibility correctly for issue with buffer time", () => {
    // 10 working days (Mon-Fri x2), 8h/day = 80h available
    // 40h estimated = +100% flexibility (80/40 - 1 = 1.0 = 100%)
    vi.setSystemTime(new Date("2025-11-03")); // Monday

    const issue = createMockIssue({
      start_date: "2025-11-03", // Monday
      due_date: "2025-11-14", // Friday (2 weeks = 10 working days)
      estimated_hours: 40,
      spent_hours: 0,
    });

    const result = calculateFlexibility(issue, defaultSchedule);

    expect(result).not.toBeNull();
    expect(result!.initial).toBe(100); // 80h available / 40h estimated = +100%
    expect(result!.status).toBe("on-track");
  });

  it("returns overbooked status when remaining time exceeds available", () => {
    // Set today to Nov 13 (Thursday) - 2 days left (Thu, Fri) = 16h available
    // But 30h remaining work = overbooked
    vi.setSystemTime(new Date("2025-11-13"));

    const issue = createMockIssue({
      start_date: "2025-11-03",
      due_date: "2025-11-14", // Friday
      estimated_hours: 40,
      spent_hours: 10, // 30h remaining
    });

    const result = calculateFlexibility(issue, defaultSchedule);

    expect(result).not.toBeNull();
    expect(result!.remaining).toBeLessThan(0); // Negative = overbooked
    expect(result!.status).toBe("overbooked");
  });

  it("returns at-risk status when flexibility is low but positive", () => {
    // 5 working days = 40h available, 35h remaining = +14% (under 20%)
    vi.setSystemTime(new Date("2025-11-10")); // Monday

    const issue = createMockIssue({
      start_date: "2025-11-03",
      due_date: "2025-11-14", // Friday
      estimated_hours: 40,
      spent_hours: 5, // 35h remaining
    });

    const result = calculateFlexibility(issue, defaultSchedule);

    expect(result).not.toBeNull();
    expect(result!.remaining).toBeGreaterThan(0);
    expect(result!.remaining).toBeLessThan(20);
    expect(result!.status).toBe("at-risk");
  });

  it("returns completed status for done issues", () => {
    vi.setSystemTime(new Date("2025-11-10"));

    const issue = createMockIssue({
      start_date: "2025-11-03",
      due_date: "2025-11-14",
      estimated_hours: 40,
      spent_hours: 40, // All time spent = done
    });
    // Simulate completed by setting done_ratio
    (issue as { done_ratio: number }).done_ratio = 100;

    const result = calculateFlexibility(issue, defaultSchedule);

    expect(result).not.toBeNull();
    expect(result!.status).toBe("completed");
  });
});
