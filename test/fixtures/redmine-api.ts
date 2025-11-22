import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const redmineHandlers = [
  http.get('http://localhost:3000/issues.json', () => {
    return HttpResponse.json({
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
    });
  }),

  http.put('http://localhost:3000/issues/:id.json', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('http://localhost:3000/time_entries.json', () => {
    return HttpResponse.json({ time_entry: { id: 1 } });
  }),
];

export const mockServer = setupServer(...redmineHandlers);
