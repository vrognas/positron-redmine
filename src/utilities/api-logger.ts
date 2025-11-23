import type * as vscode from "vscode";

export class ApiLogger {
  constructor(private channel: vscode.OutputChannel) {}

  logRequest(counter: number, method: string, path: string): void {
    const timestamp = this.formatTimestamp();
    this.channel.appendLine(`[${timestamp}] [${counter}] ${method} ${path}`);
  }

  logResponse(counter: number, status: number, duration: number): void {
    const timestamp = this.formatTimestamp();
    this.channel.appendLine(
      `[${timestamp}] [${counter}] → ${status} (${duration}ms)`
    );
  }

  logError(counter: number, error: Error, duration: number): void {
    const timestamp = this.formatTimestamp();
    this.channel.appendLine(
      `[${timestamp}] [${counter}] ERROR: ${error.message} (${duration}ms)`
    );
  }

  private formatTimestamp(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }
}
