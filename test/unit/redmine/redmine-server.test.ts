import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedmineServer } from '../../../src/redmine/redmine-server';
import * as http from 'http';
import { EventEmitter } from 'events';

// Mock http.request
vi.mock('http', async () => {
  const actual = await vi.importActual<typeof http>('http');
  return {
    ...actual,
    request: vi.fn((options: any, callback: any) => {
      const request = new EventEmitter() as any;
      request.end = function () {
        const path = options.path || '/';
        const response = new EventEmitter() as any;
        response.statusCode = 200;
        response.statusMessage = 'OK';

        setTimeout(() => {
          let data: any;

          if (options.method === 'GET' && path.includes('/issues.json')) {
            data = {
              issues: [
                {
                  id: 123,
                  subject: 'Test issue',
                  status: { id: 1, name: 'New' },
                  tracker: { id: 1, name: 'Bug' },
                  author: { id: 1, name: 'John Doe' },
                  project: { id: 1, name: 'Test Project' },
                },
              ],
              total_count: 1,
            };
          } else if (options.method === 'PUT' && path.match(/\/issues\/\d+\.json/)) {
            data = { success: true };
          } else if (options.method === 'POST' && path.includes('/time_entries.json')) {
            data = { time_entry: { id: 1 } };
          } else {
            data = { error: 'Not found' };
          }

          response.emit('data', Buffer.from(JSON.stringify(data)));
          response.emit('end');
        }, 0);

        callback(response);
      };
      request.on = function (event: string, handler: any) {
        EventEmitter.prototype.on.call(this, event, handler);
        return this;
      };
      return request;
    }),
  };
});

describe('RedmineServer', () => {
  let server: RedmineServer;

  beforeEach(() => {
    server = new RedmineServer({
      address: 'http://localhost:3000',
      key: 'test-api-key',
    });
  });

  it('should fetch issues assigned to me', async () => {
    const result = await server.getIssuesAssignedToMe();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].subject).toBe('Test issue');
  });

  it('should update issue status', async () => {
    const issue = { id: 123 } as any;
    await expect(server.setIssueStatus(issue, 2)).resolves.not.toThrow();
  });

  it('should add time entry', async () => {
    await expect(
      server.addTimeEntry(123, 9, '1.5', 'Test work')
    ).resolves.not.toThrow();
  });
});
