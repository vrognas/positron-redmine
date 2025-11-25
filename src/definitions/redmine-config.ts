import { WorkspaceConfiguration } from "vscode";

export interface RedmineConfig extends WorkspaceConfiguration {
  /**
   * HTTPS URL of Redmine server. HTTP is not allowed.
   * @example https://example.com
   * @example https://example.com:8443/redmine
   */
  url: string;
  /**
   * API Key (deprecated - use Secrets API via "Redmine: Set API Key" command)
   */
  apiKey: string;
  /**
   * Project identifier in Redmine
   */
  identifier?: string;
  /**
   * Additional headers
   */
  additionalHeaders?: { [key: string]: string };
}
