import type * as vscode from "vscode";
import {
  RedmineServer,
  RedmineServerConnectionOptions,
} from "./redmine-server";
import { ApiLogger } from "../utilities/api-logger";

type HttpMethods = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface LoggingConfig {
  enabled: boolean;
}

export class LoggingRedmineServer extends RedmineServer {
  private logger: ApiLogger;
  private counter = 0;
  private loggingConfig: LoggingConfig;

  constructor(
    options: RedmineServerConnectionOptions,
    outputChannel: vscode.OutputChannel,
    loggingConfig: LoggingConfig
  ) {
    super(options);
    this.logger = new ApiLogger(outputChannel);
    this.loggingConfig = loggingConfig;
  }

  override doRequest<T>(
    path: string,
    method: HttpMethods,
    data?: Buffer
  ): Promise<T> {
    if (!this.loggingConfig.enabled) {
      return super.doRequest<T>(path, method, data);
    }

    const requestId = ++this.counter;
    const startTime = Date.now();

    this.logger.logRequest(requestId, method, path);

    return super
      .doRequest<T>(path, method, data)
      .then((result) => {
        const duration = Date.now() - startTime;
        this.logger.logResponse(requestId, 200, duration);
        return result;
      })
      .catch((error) => {
        const duration = Date.now() - startTime;
        this.logger.logError(requestId, error, duration);
        throw error;
      });
  }
}
