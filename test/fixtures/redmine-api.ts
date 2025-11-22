import { EventEmitter } from "events";

type MockRequestOptions = { path?: string; method?: string };
type MockResponse = NodeJS.EventEmitter & {
  statusCode: number;
  statusMessage: string;
};
type MockRequest = NodeJS.EventEmitter & { end: (_data?: Buffer) => void };

export function createMockResponse(
  statusCode: number,
  data: unknown
): MockResponse {
  const response = new EventEmitter() as MockResponse;
  response.statusCode = statusCode;
  response.statusMessage = "OK";

  setTimeout(() => {
    response.emit("data", Buffer.from(JSON.stringify(data)));
    response.emit("end");
  }, 0);

  return response;
}

export function mockHttpRequest(
  options: MockRequestOptions,
  callback: (response: MockResponse) => void
): MockRequest {
  const request = new EventEmitter() as MockRequest;
  request.end = function (_data?: Buffer) {
    const path = options.path || "/";

    let response;

    // GET /issues.json?status_id=open&assigned_to_id=me
    if (options.method === "GET" && path.includes("/issues.json")) {
      response = createMockResponse(200, {
        issues: [
          {
            id: 123,
            subject: "Test issue",
            status: { id: 1, name: "New" },
            tracker: { id: 1, name: "Bug" },
            author: { id: 1, name: "John Doe" },
            project: { id: 1, name: "Test Project" },
          },
        ],
        total_count: 1,
      });
    }
    // PUT /issues/:id.json
    else if (options.method === "PUT" && path.match(/\/issues\/\d+\.json/)) {
      response = createMockResponse(200, { success: true });
    }
    // POST /time_entries.json
    else if (options.method === "POST" && path.includes("/time_entries.json")) {
      response = createMockResponse(200, { time_entry: { id: 1 } });
    } else {
      response = createMockResponse(404, { error: "Not found" });
    }

    callback(response);
  };
  request.on = function (event: string, handler: (...args: unknown[]) => void) {
    EventEmitter.prototype.on.call(this, event, handler);
    return this;
  };

  return request;
}
