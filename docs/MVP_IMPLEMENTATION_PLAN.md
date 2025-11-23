# MVP Implementation Plan

**Date**: 2025-11-23
**Context**: Solving consultant workflow gaps identified in PROBLEM_SOLUTION_FIT_ASSESSMENT.md
**Approach**: Four focused MVPs addressing P0 (critical) and P1 (high value) gaps

---

## MVP Overview

| MVP | Priority | Value | Complexity | API Changes |
|-----|----------|-------|------------|-------------|
| **MVP-1: Timeline Risk Indicators** | P0 | HIGH | LOW | None (uses existing due_date) |
| **MVP-2: Spent Hours Display** | P0 | HIGH | LOW | Query param only |
| **MVP-3: Time Entry Viewing** | P1 | HIGH | MEDIUM | New endpoint |
| **MVP-4: Quick Time Logging** | P1 | MEDIUM | LOW | None (uses existing) |

---

## MVP-1: Timeline Risk Indicators

### Problem
Cannot see deadline urgency or prioritize daily work. Issues with approaching deadlines invisible in UI.

### Solution
Visual risk indicators showing days remaining until due_date in issue tree items.

### Redmine API Reference

**NO API changes required** - uses existing Issue fields:
```json
{
  "issue": {
    "id": 123,
    "due_date": "2025-11-26",  // ✅ Already fetched
    "start_date": "2025-11-20" // ✅ Already fetched
  }
}
```

Source: [Rest Issues API](https://www.redmine.org/projects/redmine/wiki/Rest_Issues)

### UI Design

**Current display:**
```
Fix authentication bug                 #123
```

**New display:**
```
Fix authentication bug          🔴 3d  #123
Add reporting feature           🟡 7d  #456
Database optimization          🟢 21d  #789
Client documentation                   #999  (no due date)
```

**Tooltip on hover:**
```
Due: 2025-11-26 (3 days remaining)
Status: Urgent
```

### Risk Algorithm

```typescript
function getRiskLevel(issue: Issue): { level: RiskLevel; days: number | null } {
  if (!issue.due_date) return { level: 'none', days: null };

  const daysRemaining = Math.ceil(
    (new Date(issue.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  let level: RiskLevel;
  if (daysRemaining < 0) level = 'overdue';      // 🔴 red
  else if (daysRemaining <= 3) level = 'urgent'; // 🔴 red
  else if (daysRemaining <= 7) level = 'warning';// 🟡 yellow
  else level = 'ok';                              // 🟢 green

  return { level, days: daysRemaining };
}
```

**Thresholds (hardcoded in MVP):**
- Overdue: < 0 days
- Urgent: ≤ 3 days
- Warning: ≤ 7 days
- OK: > 7 days

### Implementation Plan

1. **Modify**: `/src/utilities/tree-item-factory.ts`
   - Add `getRiskIndicator(issue: Issue): string` helper
   - Update `createIssueTreeItem()` to append risk to description
   - Add tooltip with full details

2. **Test**: `/test/unit/utilities/tree-item-factory.test.ts`
   - Test 1: No due_date → no indicator
   - Test 2: Overdue (-2d) → 🔴 -2d
   - Test 3: Urgent (3d) → 🔴 3d
   - Test 4: Warning (7d) → 🟡 7d
   - Test 5: OK (21d) → 🟢 21d

3. **Update docs**:
   - CHANGELOG.md: "feat: timeline risk indicators"
   - README.md: Add screenshot + description
   - Bump version: 3.2.0 (minor)

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| No due_date | No indicator (preserve current display) |
| Invalid date | No indicator (fail gracefully) |
| Due today | 🔴 0d |
| Far future (>365d) | 🟢 365d |

### Out of Scope (Future v2)

- Configurable thresholds
- Sorting by urgency
- Workload calculation (requires spent_hours)
- Buffer visualization (due_date - start_date - work_remaining)

### Estimated Effort
- Implementation: ~50 LOC
- Tests: ~80 LOC
- Total: 2-3 hours

---

## MVP-2: Spent Hours Display

### Problem
Cannot see how much time accumulated on issues. No way to track against estimates or budgets.

### Solution
Display spent_hours alongside estimated_hours in issue tree items.

### Redmine API Reference

**API endpoint**: Already called (`GET /issues.json`)

**Add query parameter**:
```
GET /issues.json?assigned_to_id=me&status_id=open
```

**Response includes** (Redmine 3.3+):
```json
{
  "issue": {
    "id": 123,
    "estimated_hours": 8.0,
    "spent_hours": 3.5,              // ✅ Time on this issue only
    "total_estimated_hours": 12.0,   // ✅ Including subtasks
    "total_spent_hours": 5.5         // ✅ Including subtasks
  }
}
```

**Note**: Fields always present on Redmine 3.3+. No explicit `include` parameter needed.

Source: [Feature #21757](https://www.redmine.org/issues/21757), [Feature #5303](https://www.redmine.org/issues/5303)

### UI Design

**Current display:**
```
Fix authentication bug                 #123
```

**New display (with estimates):**
```
Fix authentication bug      3.5/8h 🟢 3d  #123
Add reporting feature       0/12h  🟡 7d  #456
Database optimization       8/4h!  🔴 1d  #789  (over budget)
Client documentation               🟢 5d  #999  (no estimate)
```

**Format**: `{spent}/{estimated}h`
- Over budget (spent > estimated): Append `!` and use warning color
- No estimate: Hide hours display
- No spent time: Show `0/8h`

### Implementation Plan

1. **Update Model**: `/src/redmine/models/issue.ts`
   ```typescript
   export interface Issue {
     // ... existing fields
     estimated_hours: number | null;
     spent_hours?: number;              // Add (optional for backward compat)
     total_estimated_hours?: number;    // Add
     total_spent_hours?: number;        // Add
   }
   ```

2. **Verify API Response**: Check if current Redmine server (version?) returns these fields
   - Add logging to see actual response structure
   - Handle gracefully if fields missing (older Redmine)

3. **Modify**: `/src/utilities/tree-item-factory.ts`
   - Add `getHoursDisplay(issue: Issue): string` helper
   - Update description to include hours before risk indicator
   - Format: `{hours} {risk} #{id}`

4. **Test**: `/test/unit/utilities/tree-item-factory.test.ts`
   - Test 1: No estimate → no hours display
   - Test 2: Estimate with no spent → "0/8h"
   - Test 3: Under budget → "3.5/8h"
   - Test 4: Over budget → "8/4h!"
   - Test 5: Missing fields → graceful degradation

5. **Update docs**:
   - CHANGELOG.md: "feat: display spent/estimated hours"
   - Bump version: 3.2.0 (same release as MVP-1)

### Edge Cases

| Scenario | Display |
|----------|---------|
| No estimated_hours | Hide hours (preserve current) |
| spent_hours missing (old Redmine) | Hide hours (backward compat) |
| spent = estimated | "8/8h" (no indicator) |
| spent > estimated | "9/8h!" (budget warning) |
| Decimal hours | "3.5/8h" (preserve precision) |

### Compatibility

**Minimum Redmine version**: 3.3.0 (released 2016-09-25)
- For older versions: Fields won't be present, feature disabled gracefully

### Out of Scope (Future v3)

- Configurable display format
- Total vs individual hours toggle
- Budget percentage (75% of 8h)
- Hours breakdown by user

### Estimated Effort
- Implementation: ~40 LOC
- Tests: ~60 LOC
- Total: 1-2 hours

---

## MVP-3: Time Entry Viewing

### Problem
Cannot verify logged time entries for billing accuracy. Must open browser to generate timesheets.

### Solution
New tree view "My Time Entries" showing logged time grouped by date with totals.

### Redmine API Reference

**New endpoint**: `GET /time_entries.json`

**Query parameters**:
```
GET /time_entries.json?user_id=me&from=2025-11-20&to=2025-11-23&limit=100
```

**Supported filters**:
- `user_id` - Filter by user (use `me` for current user)
- `from` - Date range start (YYYY-MM-DD)
- `to` - Date range end (YYYY-MM-DD)
- `spent_on` - Specific date (YYYY-MM-DD)
- `project_id` - Filter by project
- `issue_id` - Filter by issue
- `limit` - Results per page (default: 25, max: 100)
- `offset` - Pagination offset

**Response**:
```json
{
  "time_entries": [
    {
      "id": 123,
      "project": { "id": 73, "name": "Project Alpha" },
      "issue": { "id": 5488 },
      "user": { "id": 5, "name": "John Smith" },
      "activity": { "id": 8, "name": "Development" },
      "hours": 3.5,
      "comments": "Implemented login feature",
      "spent_on": "2025-11-23",
      "created_on": "2025-11-23T15:30:00Z",
      "updated_on": "2025-11-23T15:30:00Z"
    }
  ],
  "total_count": 42,
  "limit": 100,
  "offset": 0
}
```

Source: [Rest TimeEntries](https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries), [Feature #13275](https://www.redmine.org/issues/13275)

### UI Design

**New tree view**: "My Time Entries" (third view in redmine-explorer)

**Hierarchy**:
```
┬ 📅 Today (8.5h)                              [expanded by default]
├─ #123 Development 4.0h "Implemented login"   [Project Alpha]
├─ #456 Testing 2.5h "QA review"               [Project Beta]
└─ #789 Development 2.0h "Bug fixes"           [Project Alpha]

┬ 📅 This Week (24.5h)                         [collapsed by default]
├─ Mon Nov 20 (7.0h)
├─ Tue Nov 21 (8.5h)
└─ Wed Nov 22 (9.0h)
```

**Tree item formats**:

Date group (parent):
- Label: `📅 {period} ({total}h)`
- Collapsible state: Today = expanded, Week = collapsed

Time entry (child):
- Label: `#{issue_id} {activity} {hours}h "{comments}"`
- Description: `{project_name}`
- Click: Opens issue actions menu
- Tooltip: `Logged on {spent_on} at {created_on}`

### Implementation Plan

1. **Update Model**: `/src/redmine/models/time-entry.ts`
   ```typescript
   export interface TimeEntry {
     id: number;
     project: NamedEntity;
     issue: { id: number };        // Note: issue is minimal object
     user: NamedEntity;
     activity: NamedEntity;
     hours: number;
     comments: string;
     spent_on: string;             // Date string YYYY-MM-DD
     created_on: string;           // Timestamp
     updated_on: string;           // Timestamp
   }

   export interface TimeEntriesResponse {
     time_entries: TimeEntry[];
     total_count: number;
     limit: number;
     offset: number;
   }
   ```

2. **Add API Method**: `/src/redmine/redmine-server.ts`
   ```typescript
   async getTimeEntries(filters: {
     userId?: string | number;
     from?: string;
     to?: string;
     spentOn?: string;
     projectId?: number;
     issueId?: number;
     limit?: number;
   }): Promise<TimeEntriesResponse> {
     const params = new URLSearchParams();
     if (filters.userId) params.set('user_id', String(filters.userId));
     if (filters.from) params.set('from', filters.from);
     if (filters.to) params.set('to', filters.to);
     if (filters.spentOn) params.set('spent_on', filters.spentOn);
     if (filters.projectId) params.set('project_id', String(filters.projectId));
     if (filters.issueId) params.set('issue_id', String(filters.issueId));
     params.set('limit', String(filters.limit || 100));

     return this.doRequest<TimeEntriesResponse>(
       `/time_entries.json?${params.toString()}`,
       'GET'
     );
   }
   ```

3. **Create Tree Provider**: `/src/trees/my-time-entries-tree.ts`
   ```typescript
   type TreeItem = DateGroup | TimeEntry | LoadingPlaceholder;

   interface DateGroup {
     label: string;      // "Today", "This Week"
     from: string;       // YYYY-MM-DD
     to: string;         // YYYY-MM-DD
     total?: number;     // Calculated after fetch
   }

   export class MyTimeEntriesTree implements vscode.TreeDataProvider<TreeItem> {
     async getChildren(element?: TreeItem): Promise<TreeItem[]> {
       if (!element) {
         // Root: return date groups
         return [
           { label: 'Today', from: today(), to: today() },
           { label: 'This Week', from: weekAgo(), to: today() }
         ];
       }

       if (element instanceof DateGroup) {
         // Fetch time entries for date range
         const response = await this.server.getTimeEntries({
           userId: 'me',
           from: element.from,
           to: element.to,
           limit: 100
         });

         // Calculate total
         const total = response.time_entries.reduce(
           (sum, entry) => sum + entry.hours, 0
         );
         element.total = total;

         return response.time_entries;
       }
     }

     getTreeItem(element: TreeItem): vscode.TreeItem {
       if (element instanceof DateGroup) {
         return {
           label: `📅 ${element.label}${element.total ? ` (${element.total}h)` : ''}`,
           collapsibleState: element.label === 'Today'
             ? vscode.TreeItemCollapsibleState.Expanded
             : vscode.TreeItemCollapsibleState.Collapsed
         };
       }

       if (element instanceof TimeEntry) {
         return {
           label: `#${element.issue.id} ${element.activity.name} ${element.hours}h "${element.comments}"`,
           description: element.project.name,
           command: {
             command: 'redmine.openActionsForIssue',
             arguments: [false, { server: this.server }, String(element.issue.id)],
             title: `Open issue #${element.issue.id}`
           }
         };
       }
     }
   }
   ```

4. **Register Tree View**: `/src/extension.ts`
   ```typescript
   const myTimeEntriesTree = new MyTimeEntriesTree();

   vscode.window.createTreeView('redmine-explorer-my-time-entries', {
     treeDataProvider: myTimeEntriesTree
   });

   registerCommand('refreshTimeEntries', () => {
     myTimeEntriesTree.refresh();
   });
   ```

5. **Add to package.json**:
   ```json
   "contributes": {
     "views": {
       "redmine-explorer": [
         {
           "id": "redmine-explorer-my-time-entries",
           "name": "My Time Entries"
         }
       ]
     },
     "commands": [
       {
         "command": "redmine.refreshTimeEntries",
         "title": "Refresh Time Entries",
         "icon": "$(refresh)"
       }
     ],
     "menus": {
       "view/title": [
         {
           "command": "redmine.refreshTimeEntries",
           "when": "view == 'redmine-explorer-my-time-entries'",
           "group": "navigation"
         }
       ]
     }
   }
   ```

6. **Write Tests**: `/test/unit/trees/my-time-entries-tree.test.ts`
   - Test 1: Groups created correctly (Today, This Week)
   - Test 2: Fetches entries with correct date filters
   - Test 3: Calculates totals correctly
   - Test 4: Empty state (no entries)

7. **Test API Method**: `/test/unit/redmine/redmine-server.test.ts`
   - Test 1: Builds query params correctly
   - Test 2: Parses response correctly
   - Test 3: Handles pagination

8. **Update docs**:
   - CHANGELOG.md: "feat: time entry viewing"
   - README.md: Add screenshot + usage
   - Bump version: 3.3.0 (minor)

### Date Helper Functions

```typescript
function today(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function weekAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().split('T')[0];
}
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| No entries today | Show "No time logged today" placeholder |
| 100+ entries | Show first 100, add "View more" button |
| Missing issue | Display as "#??? Unknown issue" |
| Empty comments | Show hours only: "#123 Development 2.0h" |
| API error | Show error message in tree |

### Out of Scope (Future v4)

- Edit/delete time entries
- Custom date range picker
- Grouping by project
- Export to CSV
- Time entry conflicts detection

### Estimated Effort
- Implementation: ~200 LOC
- Tests: ~150 LOC
- Total: 4-6 hours

---

## MVP-4: Quick Time Logging

### Problem
Multi-step workflow for frequent time logging. Consultant logs 5-10x daily, current process too slow.

### Solution
Command palette shortcut that remembers last issue and activity for rapid re-logging.

### Redmine API Reference

**Uses existing endpoint**: `POST /time_entries.json`

Request body:
```json
{
  "time_entry": {
    "issue_id": 123,
    "hours": 2.5,
    "activity_id": 8,
    "comments": "Implemented login feature"
  }
}
```

No API changes needed.

Source: [Rest TimeEntries](https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries)

### UX Design

**Command**: `Redmine: Quick Log Time`

**Flow (first time - 3 steps)**:
1. Command palette → "Redmine: Quick Log Time"
2. Pick issue from assigned issues list
3. Input: "2.5|Implemented login" (defaults to last activity)

**Flow (repeat logging - 2 steps)**:
1. Command palette → "Redmine: Quick Log Time"
2. Input prompt shows: "Log time to #123: Fix auth bug (2.5|comment)"

**Flow (power user with keybinding - 1-2 steps)**:
1. Press `Ctrl+Alt+T` → prompt appears
2. Enter "2.5|Fixed bug" → done

### Smart Defaults

**Recent Issue Memory**:
```typescript
interface RecentTimeLog {
  issueId: number;
  issueSubject: string;
  lastActivityId: number;
  lastActivityName: string;
  lastLogged: Date;
}
```

- Store last logged issue in `context.globalState`
- Display in prompt: "Log to #123: Subject"
- Option to pick different issue
- Clear if > 24h old

**Activity Selection**:
- Default to last-used activity for this issue
- Global fallback: "Development" (id: 8, typical default)
- Persistent across sessions

### Implementation Plan

1. **Create Command**: `/src/commands/quick-log-time.ts`
   ```typescript
   export default async ({ server }: ActionProperties, context: vscode.ExtensionContext) => {
     // Get recent log from state
     const recent = context.globalState.get<RecentTimeLog>('lastTimeLog');

     let issueId: number;
     let activityId: number;

     if (recent && isRecent(recent.lastLogged)) {
       // Prompt with recent issue pre-filled
       const useRecent = await vscode.window.showQuickPick([
         { label: `Log to #${recent.issueId}: ${recent.issueSubject}`, value: 'recent' },
         { label: 'Choose different issue', value: 'new' }
       ]);

       if (!useRecent) return;

       if (useRecent.value === 'recent') {
         issueId = recent.issueId;
         activityId = recent.lastActivityId;
       } else {
         ({ issueId, activityId } = await pickIssueAndActivity(server));
       }
     } else {
       // No recent, pick fresh
       ({ issueId, activityId } = await pickIssueAndActivity(server));
     }

     // Input hours and comment
     const input = await vscode.window.showInputBox({
       prompt: `Log time to #${issueId}`,
       placeHolder: '2.5|Implemented feature',
       validateInput: (value) => {
         const match = value.match(/^(\d+\.?\d*)\|(.*)$/);
         return match ? null : 'Format: hours|comment';
       }
     });

     if (!input) return;

     const [_, hours, comments] = input.match(/^(\d+\.?\d*)\|(.*)$/)!;

     // Submit
     await server.addTimeEntry(
       issueId,
       parseFloat(hours),
       activityId,
       comments
     );

     // Save to recent
     context.globalState.update('lastTimeLog', {
       issueId,
       issueSubject: '...', // Fetch from issues list
       lastActivityId: activityId,
       lastActivityName: '...',
       lastLogged: new Date()
     });

     vscode.window.showInformationMessage(
       `Logged ${hours}h to #${issueId}`
     );
   };
   ```

2. **Register Command**: `/src/extension.ts`
   ```typescript
   registerCommand('quickLogTime', (props: ActionProperties) => {
     return quickLogTime(props, context); // Pass context for state
   });
   ```

3. **Add to package.json**:
   ```json
   "contributes": {
     "commands": [
       {
         "command": "redmine.quickLogTime",
         "title": "Redmine: Quick Log Time"
       }
     ],
     "keybindings": [
       {
         "command": "redmine.quickLogTime",
         "key": "ctrl+alt+t",
         "mac": "cmd+alt+t"
       }
     ]
   }
   ```

4. **Write Tests**: `/test/unit/commands/quick-log-time.test.ts`
   - Test 1: First time flow (no recent)
   - Test 2: Recent issue flow
   - Test 3: Input validation
   - Test 4: State persistence

5. **Update docs**:
   - CHANGELOG.md: "feat: quick time logging command"
   - README.md: Add usage + keybinding
   - Bump version: 3.3.0 (same as MVP-3)

### Helper Functions

```typescript
function isRecent(lastLogged: Date): boolean {
  const hoursAgo = (Date.now() - lastLogged.getTime()) / (1000 * 60 * 60);
  return hoursAgo < 24; // Within last 24h
}

async function pickIssueAndActivity(server: RedmineServer): Promise<{
  issueId: number;
  activityId: number;
}> {
  const { issues } = await server.getIssuesAssignedToMe();

  const picked = await vscode.window.showQuickPick(
    issues.map(issue => ({
      label: issue.subject,
      description: `#${issue.id}`,
      issue
    }))
  );

  if (!picked) throw new Error('No issue selected');

  const activities = await server.getTimeEntryActivities();
  const activity = await vscode.window.showQuickPick(
    activities.time_entry_activities.map(a => ({
      label: a.name,
      activity: a
    }))
  );

  if (!activity) throw new Error('No activity selected');

  return {
    issueId: picked.issue.id,
    activityId: activity.activity.id
  };
}
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| No assigned issues | Show error, suggest browser |
| No recent log | Skip recent prompt, go to picker |
| Recent > 24h old | Treat as no recent |
| Invalid input format | Validation error, re-prompt |
| API error | Show error, don't update state |

### Out of Scope (Future v5)

- Status bar integration
- Multiple recent issues (LRU cache of 5)
- Time format variations ("1.5h" instead of "1.5")
- Auto-activity detection based on file type
- Batch time logging

### Estimated Effort
- Implementation: ~150 LOC
- Tests: ~100 LOC
- Total: 3-4 hours

---

## Implementation Sequence

### Phase 1: Timeline & Hours (Week 1)
1. **MVP-1**: Timeline Risk Indicators (2-3h)
2. **MVP-2**: Spent Hours Display (1-2h)
3. Testing + documentation (2h)
4. **Release**: v3.2.0

**Value**: Immediate daily work prioritization

### Phase 2: Time Tracking (Week 2)
1. **MVP-3**: Time Entry Viewing (4-6h)
2. **MVP-4**: Quick Time Logging (3-4h)
3. Testing + documentation (3h)
4. **Release**: v3.3.0

**Value**: Complete time tracking workflow in IDE

### Total Estimated Effort
- Implementation: ~15-17 hours
- Testing: ~5-6 hours
- Documentation: ~2-3 hours
- **Total**: ~22-26 hours (3-4 days)

---

## Testing Strategy (TDD per CLAUDE.md)

### Before Implementation
1. Review `docs/LESSONS_LEARNED.md`
2. Review `docs/ARCHITECTURE.md`
3. Review `CLAUDE.md`

### During Implementation
1. Write tests FIRST for each MVP
2. Aim for 3 e2e tests per feature (minimalist)
3. Target 60% coverage (realistic per lessons learned)
4. Mock API responses using existing patterns
5. Avoid testing VS Code UI integration

### After Implementation
1. Run full test suite: `npm test`
2. Verify coverage: `npm run coverage`
3. Update `docs/LESSONS_LEARNED.md` with insights
4. Update `docs/ARCHITECTURE.md` if needed

---

## Success Metrics

### MVP-1 & MVP-2: Timeline/Hours
- **Goal**: Reduce daily browser visits for work prioritization by 80%
- **Measure**: User can answer "what should I work on today?" from IDE

### MVP-3: Time Entry Viewing
- **Goal**: Eliminate browser visits for time verification
- **Measure**: User can verify daily time logs from IDE

### MVP-4: Quick Time Logging
- **Goal**: Reduce time logging from 5 steps to 2 steps
- **Measure**: Log time in <10 seconds with <3 interactions

### Overall
- **Goal**: Reduce Redmine browser visits from ~10/day to ~2/day
- **Target**: 80% of workflow in IDE vs current 20%

---

## Risk Mitigation

### Risk: Redmine Version Compatibility
- **Mitigation**: Graceful degradation for missing fields
- **Testing**: Test with Redmine 3.3+ and <3.3

### Risk: Performance (API Call Volume)
- **Mitigation**:
  - MVP-1/MVP-2: No additional calls (uses existing data)
  - MVP-3: Lazy loading (fetch on expand)
  - Cache time entries for 5min
- **Testing**: Monitor API logs, add pagination if needed

### Risk: User Confusion (New UI Elements)
- **Mitigation**:
  - Clear tooltips
  - README documentation
  - Gradual rollout (MVP-1/2 first, then MVP-3/4)

### Risk: Breaking Changes
- **Mitigation**:
  - Follow semantic versioning
  - No changes to existing models (only additions)
  - Backward compatible (features degrade gracefully)

---

## Unresolved Questions

### MVP-1: Timeline Risk
1. Should overdue issues sort to top automatically?
2. Include start_date in tooltip?
3. Configuration for thresholds in v2?

### MVP-2: Spent Hours
1. Use total_spent_hours (with subtasks) or spent_hours (issue only)?
2. Display format preference: "3.5/8h" vs "3.5h/8h" vs "44%"?
3. Color coding for over-budget?

### MVP-3: Time Entries
1. Empty state message: "No time logged" or "Click to log time"?
2. Refresh strategy: manual only or auto-refresh after logging?
3. Max entries per group: 100 or unlimited with pagination?

### MVP-4: Quick Logging
1. Keyboard shortcut: Ctrl+Alt+T or different binding?
2. State scope: globalState (cross-workspace) or workspaceState?
3. Recent issue limit: 1 (MVP) or 5 (more useful)?

---

## Next Steps

1. **Review this plan** with user
2. **Answer unresolved questions**
3. **Begin implementation** (MVP-1 first, TDD approach)
4. **Iterate based on feedback** (each MVP can be released independently)

---

## References

### Redmine API Documentation
- [Rest Issues API](https://www.redmine.org/projects/redmine/wiki/Rest_Issues)
- [Rest TimeEntries API](https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries)
- [Feature #21757: Total spent/estimated hours](https://www.redmine.org/issues/21757)
- [Feature #5303: Add spent_hours to issues API](https://www.redmine.org/issues/5303)
- [Feature #13275: Time entries filtering](https://www.redmine.org/issues/13275)

### Codebase Documentation
- `/home/user/positron-redmine/docs/ARCHITECTURE.md`
- `/home/user/positron-redmine/docs/LESSONS_LEARNED.md`
- `/home/user/positron-redmine/docs/PROBLEM_SOLUTION_FIT_ASSESSMENT.md`
- `/home/user/positron-redmine/CLAUDE.md`
