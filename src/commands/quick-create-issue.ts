import * as vscode from "vscode";
import type { ActionProperties } from "./action-properties";
import { showStatusBarMessage } from "../utilities/status-bar";

interface CreatedIssue {
  id: number;
  subject: string;
}

// Validators
const validateHours = (v: string): string | null =>
  !v || (parseFloat(v) >= 0 && !isNaN(parseFloat(v))) ? null : "Must be positive number";

const validateDate = (v: string): string | null => {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v).getTime())
    ? null
    : "Use YYYY-MM-DD format";
};

// Shared input prompts
async function promptOptionalFields(prefix: string, step: number) {
  const description = await vscode.window.showInputBox({
    title: `${prefix} (${step}/5) - Description`,
    prompt: "Description (optional, Enter to skip)",
    placeHolder: "Detailed description...",
  });
  if (description === undefined) return undefined;

  const hours = await vscode.window.showInputBox({
    title: `${prefix} (${step + 1}/5) - Estimated Hours`,
    prompt: "Estimated hours (optional, Enter to skip)",
    placeHolder: "e.g., 8",
    validateInput: validateHours,
  });
  if (hours === undefined) return undefined;

  const dueDate = await vscode.window.showInputBox({
    title: `${prefix} (${step + 2}/5) - Due Date`,
    prompt: "Due date (optional, Enter to skip)",
    placeHolder: "YYYY-MM-DD",
    validateInput: validateDate,
  });
  if (dueDate === undefined) return undefined;

  return {
    description: description || undefined,
    estimated_hours: hours ? parseFloat(hours) : undefined,
    due_date: dueDate || undefined,
  };
}

/**
 * Quick create issue wizard
 */
export async function quickCreateIssue(
  props: ActionProperties
): Promise<CreatedIssue | undefined> {
  try {
    // Parallel fetch metadata while user sees first picker
    const [projects, trackers, priorities] = await Promise.all([
      props.server.getProjects(),
      props.server.getTrackers(),
      props.server.getPriorities(),
    ]);

    const projectPick = await vscode.window.showQuickPick(
      projects.map((p) => {
        const item = p.toQuickPickItem();
        return { label: item.label, description: item.description, id: p.id };
      }),
      { title: "Create Issue (1/5) - Project", placeHolder: "Select project" }
    );
    if (!projectPick) return undefined;

    const trackerPick = await vscode.window.showQuickPick(
      trackers.map((t) => ({ label: t.name, id: t.id })),
      { title: "Create Issue (2/5) - Tracker", placeHolder: "Select tracker" }
    );
    if (!trackerPick) return undefined;

    const priorityPick = await vscode.window.showQuickPick(
      priorities.map((p) => ({ label: p.name, id: p.id })),
      { title: "Create Issue (3/5) - Priority", placeHolder: "Select priority" }
    );
    if (!priorityPick) return undefined;

    const subject = await vscode.window.showInputBox({
      title: "Create Issue (4/5) - Subject",
      prompt: `Issue subject for ${projectPick.label}`,
      placeHolder: "e.g., Implement login feature",
      validateInput: (v) => (v ? null : "Subject is required"),
    });
    if (!subject) return undefined;

    const optional = await promptOptionalFields("Create Issue", 5);
    if (!optional) return undefined;

    const response = await props.server.createIssue({
      project_id: projectPick.id,
      tracker_id: trackerPick.id,
      priority_id: priorityPick.id,
      subject,
      ...optional,
    });

    showStatusBarMessage(`$(check) Created #${response.issue.id}: ${response.issue.subject}`);
    return { id: response.issue.id, subject: response.issue.subject };
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create issue: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

/**
 * Quick create sub-issue - inherits parent's project and tracker
 */
export async function quickCreateSubIssue(
  props: ActionProperties,
  parentIssueId: number
): Promise<CreatedIssue | undefined> {
  try {
    const [parentResponse, priorities] = await Promise.all([
      props.server.getIssueById(parentIssueId),
      props.server.getPriorities(),
    ]);
    const parent = parentResponse.issue;

    const priorityPick = await vscode.window.showQuickPick(
      priorities.map((p) => ({ label: p.name, id: p.id })),
      { title: `Sub-Issue of #${parent.id} (1/5) - Priority`, placeHolder: "Select priority" }
    );
    if (!priorityPick) return undefined;

    const subject = await vscode.window.showInputBox({
      title: `Sub-Issue of #${parent.id} (2/5) - Subject`,
      prompt: `Sub-issue of #${parent.id}: ${parent.subject}`,
      placeHolder: "e.g., Subtask description",
      validateInput: (v) => (v ? null : "Subject is required"),
    });
    if (!subject) return undefined;

    const optional = await promptOptionalFields(`Sub-Issue of #${parent.id}`, 3);
    if (!optional) return undefined;

    const response = await props.server.createIssue({
      project_id: parent.project.id,
      tracker_id: parent.tracker.id,
      priority_id: priorityPick.id,
      subject,
      parent_issue_id: parentIssueId,
      ...optional,
    });

    showStatusBarMessage(`$(check) Created #${response.issue.id} under #${parentIssueId}`);
    return { id: response.issue.id, subject: response.issue.subject };
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create sub-issue: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}
