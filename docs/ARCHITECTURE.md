# Architecture Documentation

## Overview

Positron-Redmine is a VS Code/Positron IDE extension that integrates Redmine project management. Built on TypeScript 5.9+, it provides sidebar views, issue management, time tracking, and workload visualization via Redmine REST API.

**Core Pattern**: MVC-like with Tree Providers (View), Controllers (Business Logic), and RedmineServer (Model/API).

**Version**: 3.4.0 | **Min VS Code**: 1.106.0 | **Node**: >=20.0.0

## Directory Structure

```
positron-redmine/
├── src/
│   ├── extension.ts              # Entry point, dependency wiring, lifecycle
│   ├── commands/                 # User-triggered actions (7 commands)
│   │   ├── commons/             # Shared command utilities
│   │   │   └── open-actions-for-issue-id.ts
│   │   ├── action-properties.ts # Command parameter interface
│   │   ├── list-open-issues-assigned-to-me.ts
│   │   ├── new-issue.ts
│   │   ├── open-actions-for-issue.ts
│   │   ├── open-actions-for-issue-under-cursor.ts
│   │   ├── quick-log-time.ts    # Quick time logging with keyboard shortcut
│   │   └── set-api-key.ts       # Secure API key storage
│   ├── controllers/             # Business logic orchestration
│   │   ├── domain.ts           # Domain models (Membership, IssueStatus, QuickUpdate)
│   │   └── issue-controller.ts # Issue operations, action menus
│   ├── redmine/                # Redmine API integration
│   │   ├── redmine-server.ts  # HTTP client, API methods, caching
│   │   ├── logging-redmine-server.ts # Decorator for API logging
│   │   ├── redmine-project.ts # Project representation
│   │   └── models/            # TypeScript interfaces for API responses
│   │       ├── issue.ts
│   │       ├── issue-status.ts
│   │       ├── membership.ts
│   │       ├── named-entity.ts
│   │       ├── project.ts
│   │       ├── time-entry.ts
│   │       └── time-entry-activity.ts
│   ├── trees/                 # VS Code tree view providers
│   │   ├── my-issues-tree.ts       # "Issues assigned to me" with flexibility scoring
│   │   ├── my-time-entries-tree.ts # "My Time Entries" (Today/Week/Month)
│   │   └── projects-tree.ts        # "Projects" (list/tree modes)
│   ├── definitions/           # TypeScript interfaces
│   │   └── redmine-config.ts  # Extension configuration schema
│   └── utilities/             # Helper functions
│       ├── api-logger.ts           # API request/response logging
│       ├── error-to-string.ts      # Safe error message extraction
│       ├── flexibility-calculator.ts # Issue timeline risk calculation
│       ├── redaction.ts            # Sensitive data redaction
│       ├── secret-manager.ts       # VS Code Secrets API wrapper
│       ├── tree-item-factory.ts    # TreeItem creation with icons
│       └── workload-calculator.ts  # Status bar workload summary
├── test/
│   ├── fixtures/              # Shared test data
│   │   └── redmine-api.ts     # Mock API responses
│   ├── mocks/
│   │   └── vscode.ts          # VS Code API mock for unit tests
│   └── unit/                  # Unit tests (Vitest)
│       ├── build/
│       ├── commands/
│       ├── controllers/
│       ├── redmine/
│       ├── scripts/
│       ├── trees/
│       └── utilities/
├── scripts/                   # Git hooks, setup scripts
│   ├── commit-msg             # Commit message validation hook
│   ├── install-hooks.sh       # Hook installation script
│   └── validate-commits.sh
├── docs/
│   ├── ARCHITECTURE.md        # This file
│   ├── API_REFERENCE.md       # Extension API documentation
│   ├── LESSONS_LEARNED.md     # Development insights
│   ├── MIGRATION_GUIDE.md     # v2 → v3 migration
│   └── redmine_api_docs.md    # Redmine REST API reference
└── [config files]             # package.json, tsconfig.json, etc.
```

## Component Architecture

### 1. Extension Entry Point (`src/extension.ts`)

**Responsibility**: Bootstrap extension, wire dependencies, manage lifecycle.

**Key Sections**:

| Lines | Section | Purpose |
|-------|---------|---------|
| 1-21 | Imports | All module imports |
| 23-36 | Module state | `cleanupResources` for disposal |
| 38-265 | `activate()` | Main initialization |
| 778-813 | `deactivate()` | Cleanup and disposal |

**Initialization Flow**:

```
activate()
  │
  ├─► Create bucket for server instance reuse (39-43)
  ├─► Initialize SecretManager (45)
  ├─► Create output channel for API logs (46)
  │
  ├─► Create tree providers (66-68)
  │   ├─► MyIssuesTree
  │   ├─► ProjectsTree
  │   └─► MyTimeEntriesTreeDataProvider
  │
  ├─► Register tree views with VS Code (73-81)
  │
  ├─► Initialize workload status bar (84-106)
  │   └─► Opt-in via redmine.statusBar.showWorkload
  │
  ├─► Listen for secret changes (166-170)
  │
  ├─► updateConfiguredContext() (173-226)
  │   ├─► Check URL + API key presence
  │   ├─► Set redmine:configured context
  │   └─► Initialize server for trees
  │
  ├─► Config change listener with debouncing (235-265)
  │   └─► 300ms debounce for rapid changes
  │
  ├─► Register commands
  │   ├─► redmine.configure (268-404)
  │   ├─► redmine.setApiKey (476-481)
  │   └─► registerCommand() wrapper (621-645)
  │
  └─► parseConfiguration() (495-582)
      ├─► Workspace folder selection
      ├─► Config reading
      ├─► Server creation/reuse (LRU cache, max 3)
      └─► Return ActionProperties
```

**Server Instance Bucket** (553-573):

```typescript
// LRU cache with max 3 servers
if (bucket.servers.length >= 3) {
  const removed = bucket.servers.shift();
  if (removed instanceof LoggingRedmineServer) {
    removed.dispose();
  }
}
bucket.servers.push(server);
```

### 2. Redmine API Layer (`src/redmine/`)

#### RedmineServer (`redmine-server.ts:56-520`)

**Responsibility**: HTTP client for Redmine REST API with caching.

**Connection Options** (21-46):

```typescript
interface RedmineServerConnectionOptions {
  address: string;           // https://redmine.example.com
  key: string;               // API key from user account
  rejectUnauthorized?: boolean; // SSL cert validation
  additionalHeaders?: object;   // Custom headers (auth proxies)
  requestFn?: typeof http.request; // DI for testing
}
```

**HTTP Flow** (`doRequest<T>()`, lines 141-247):

```
doRequest(path, method, data?)
  │
  ├─► Build options (hostname, port, headers, path)
  ├─► Create request (http or https based on protocol)
  │
  ├─► Handle response
  │   ├─► 401 → Invalid API key error
  │   ├─► 403 → Permission denied error
  │   ├─► 404 → Resource not found error
  │   ├─► 400+ → Generic server error
  │   └─► Success → Parse JSON, call onResponseSuccess()
  │
  ├─► 30s timeout to prevent hangs (236-243)
  │
  └─► Return Promise<T>
```

**Protected Hooks for Logging** (106-139):

```typescript
// Child classes override for logging
protected onResponseSuccess(
  statusCode, statusMessage, path, method,
  requestBody?, responseBody?, contentType?, requestId?
): void {}

protected onResponseError(
  statusCode, statusMessage, error, path, method,
  requestBody?, responseBody?, contentType?, requestId?
): void {}
```

**API Methods**:

| Method | Line | Purpose | Caching |
|--------|------|---------|---------|
| `getProjects()` | 249-278 | Paginated project fetch | No |
| `getTimeEntryActivities()` | 281-300 | Activity types | Yes (instance) |
| `addTimeEntry()` | 302-322 | Log time to issue | No |
| `getTimeEntries()` | 328-345 | User's time entries | No |
| `getIssueById()` | 351-353 | Single issue fetch | No |
| `setIssueStatus()` | 358-371 | Update issue status | No |
| `getIssueStatuses()` | 378-396 | All statuses | Yes (instance) |
| `getIssueStatusesTyped()` | 398-401 | Typed status list | Via getIssueStatuses |
| `getMemberships()` | 402-412 | Project members | No |
| `applyQuickUpdate()` | 413-437 | Batch issue update | No |
| `getIssuesAssignedToMe()` | 442-471 | Current user's issues | No |
| `getOpenIssuesForProject()` | 476-509 | Project issues | No |

**Pagination Pattern** (used in `getProjects`, `getIssuesAssignedToMe`, `getOpenIssuesForProject`):

```typescript
const req = async (offset=0, limit=50, count=null, accumulator=[]) => {
  if (count !== null && count <= offset) return accumulator;
  const response = await this.doRequest<{items, total_count}>(...);
  return req(offset+limit, limit, response.total_count, accumulator.concat(response.items));
};
return req();
```

#### LoggingRedmineServer (`logging-redmine-server.ts`)

**Pattern**: Decorator extending RedmineServer for API logging.

**Features**:
- Request/response logging to output channel
- Request counter for correlation
- Duration tracking
- Stale request cleanup (60s timeout)
- Disposable for cleanup timer

**Log Format**:

```
[14:23:45.123] [1] POST /users.json
  Body: {"user":{"login":"admin","password":"***"}}
[14:23:45.265] [1] → 201 (142ms) 85B
```

### 3. Tree View Providers (`src/trees/`)

All tree providers implement `vscode.TreeDataProvider<T>`.

#### MyIssuesTree (`my-issues-tree.ts:36-166`)

**Displays**: Issues assigned to current user with flexibility scores.

**State**:
```typescript
server?: RedmineServer;
isLoading = false;
pendingFetch: Promise<Issue[]> | null = null;  // Dedup concurrent fetches
flexibilityCache = new Map<number, FlexibilityScore | null>();
cachedIssues: Issue[] = [];
```

**Data Flow**:

```
getChildren()
  │
  ├─► Return [] if no server
  ├─► Return loading placeholder if isLoading
  │
  ├─► Fetch issues from server
  ├─► Calculate flexibility scores for all issues
  │   └─► Cache in flexibilityCache
  │
  ├─► Sort by risk priority
  │   ├─► overbooked (0) - highest priority
  │   ├─► at-risk (1)
  │   ├─► on-track (2)
  │   └─► completed (3) - lowest priority
  │
  └─► Return sorted issues
```

**TreeItem Creation** (`tree-item-factory.ts:44-90`):

```typescript
createEnhancedIssueTreeItem(issue, flexibility, server, commandName)
  │
  ├─► Label: issue.subject
  ├─► Description: "#123 10/40h 5d On Track"
  ├─► Icon: ThemeIcon with status color
  │   ├─► pass (green) for completed
  │   ├─► git-pull-request-draft (green) for on-track
  │   ├─► warning (yellow) for at-risk
  │   └─► error (red) for overbooked
  ├─► Tooltip: Rich markdown with details
  └─► contextValue: "issue-completed" | "issue-active"
```

#### MyTimeEntriesTreeDataProvider (`my-time-entries-tree.ts:17-328`)

**Displays**: Time entries grouped by period (Today/Week/Month).

**Architecture**:
- Async background loading (<10ms initial render)
- Issue caching with batch fetching
- Parallel API requests for all periods

**Tree Structure**:
```
📅 Today (8.5h/8h, 106%)
  └─ #7392 Data Management (1.25h Development)
📅 This Week (17.5h/40h, 44%)
  └─ ...
📅 This Month (42.0h/160h, 26%)
  └─ ...
```

**Loading Pattern** (non-blocking):

```typescript
async getChildren(element?) {
  if (!element) {
    if (this.cachedGroups) return this.cachedGroups;
    if (!this.isLoading) {
      this.isLoading = true;
      this.loadTimeEntries();  // Fire and forget
    }
    return [loadingNode];  // Immediate return
  }
  // ... child handling
}
```

#### ProjectsTree (`projects-tree.ts:19-118`)

**Displays**: All projects with optional hierarchy.

**View Modes** (`ProjectsViewStyle` enum):
- `LIST` (0): Flat list of all projects
- `TREE` (1): Hierarchical view respecting parent/child

**Data Flow**:

```
getChildren(element?)
  │
  ├─► element = undefined (root)
  │   ├─► Return loading if isLoadingProjects
  │   ├─► Fetch projects if not cached
  │   └─► Filter by viewStyle
  │       ├─► LIST: Return all projects
  │       └─► TREE: Return root projects (no parent)
  │
  └─► element = RedmineProject
      ├─► Track loading state per project
      └─► viewStyle
          ├─► LIST: Return project issues
          └─► TREE: Return subprojects + issues
```

### 4. Commands (`src/commands/`)

**Registration Pattern** (`extension.ts:621-645`):

```typescript
const registerCommand = (name, action) => {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      `redmine.${name}`,
      (withPick?, props?, ...args) => {
        parseConfiguration(withPick, props, ...args).then(({ props, args }) => {
          if (props) action(props, ...args);
        });
      }
    )
  );
};
```

**Command Map**:

| Command | File | Trigger |
|---------|------|---------|
| `listOpenIssuesAssignedToMe` | list-open-issues-assigned-to-me.ts | Command palette |
| `openActionsForIssue` | open-actions-for-issue.ts | Tree click, input |
| `openActionsForIssueUnderCursor` | open-actions-for-issue-under-cursor.ts | Editor context |
| `newIssue` | new-issue.ts | Opens browser |
| `quickLogTime` | quick-log-time.ts | Ctrl+Y Ctrl+Y |
| `setApiKey` | set-api-key.ts | Command palette |
| `configure` | extension.ts (inline) | Tree header |
| `changeDefaultServer` | extension.ts (inline) | Multi-workspace |
| `refreshIssues` | extension.ts (inline) | Tree header |
| `refreshTimeEntries` | extension.ts (inline) | Tree header |
| `toggleTreeView` / `toggleListView` | extension.ts (inline) | Projects tree |
| `openTimeEntryInBrowser` | extension.ts (inline) | Time entry context |
| `openIssueInBrowser` | extension.ts (inline) | Issue context |
| `copyIssueUrl` | extension.ts (inline) | Issue context |
| `showApiOutput` | extension.ts (inline) | Debug |
| `clearApiOutput` | extension.ts (inline) | Debug |
| `toggleApiLogging` | extension.ts (inline) | Debug |

#### Quick Log Time (`quick-log-time.ts`)

**Flow**:

```
quickLogTime()
  │
  ├─► Get recent log from globalState cache
  │
  ├─► Prompt: recent issue or pick new?
  │   ├─► Recent: Use cached issue/activity
  │   └─► New: pickIssueAndActivity()
  │       ├─► Show LRU recent issues first
  │       ├─► Pick issue from list
  │       └─► Pick activity type
  │
  ├─► Get today's logged hours
  │
  ├─► Input hours (flexible formats)
  │   ├─► "1.75" (decimal)
  │   ├─► "1:45" (hours:minutes)
  │   └─► "1h 45min" (units)
  │
  ├─► Input comment (optional)
  │
  ├─► POST time entry
  │
  ├─► Update cache
  │
  └─► Show status bar confirmation (3s)
```

### 5. Controllers (`src/controllers/`)

#### IssueController (`issue-controller.ts`)

**Responsibility**: Orchestrate issue operations via VS Code UI prompts.

**Constructor**: `(issue: Issue, redmine: RedmineServer)`

**Actions** (via `listActions()`):

| Action | Method | Purpose |
|--------|--------|---------|
| Change status | `changeStatus()` | Update issue status |
| Add time entry | `addTimeEntry()` | Log time with activity |
| Open in browser | `openInBrowser()` | External URL |
| Quick update | `quickUpdate()` | Batch: status + assignee + message |

**Quick Update Flow**:

```
quickUpdate()
  │
  ├─► Fetch memberships + statuses (parallel)
  │
  ├─► Prompt: new status
  ├─► Prompt: new assignee
  ├─► Prompt: message
  │
  ├─► Build QuickUpdate object
  │
  ├─► applyQuickUpdate() → server
  │
  └─► Validate result (check differences array)
```

#### Domain Models (`domain.ts`)

```typescript
class Membership { id, name, isUser }
class IssueStatus { statusId, name }
class QuickUpdate { issueId, message, assignee, status }
class QuickUpdateResult {
  differences: string[] = [];
  isSuccessful() { return this.differences.length === 0; }
}
```

### 6. Utilities (`src/utilities/`)

#### SecretManager (`secret-manager.ts`)

**Responsibility**: Secure API key storage via VS Code Secrets API.

**Key Format**: `redmine:${hex(folderUri)}:apiKey:v1`

**Methods**:
- `getApiKey(folderUri)` → `string | undefined`
- `setApiKey(folderUri, apiKey)` → `void`
- `deleteApiKey(folderUri)` → `void`
- `onSecretChanged(callback)` → `Disposable`

**Platform Storage**:
- Windows: Credential Manager
- macOS: Keychain
- Linux: libsecret/gnome-keyring

#### Flexibility Calculator (`flexibility-calculator.ts`)

**Purpose**: Calculate issue timeline risk based on due date and remaining work.

**Formula**:
```
flexibility = (available_hours / needed_hours - 1) * 100

+100% = double the time needed
   0% = exactly enough time
 -50% = need 50% more time
```

**Status Thresholds**:
- `completed`: done_ratio === 100
- `overbooked`: remaining < 0
- `at-risk`: remaining < 20
- `on-track`: remaining >= 20

**Exported Functions**:
- `calculateFlexibility(issue, schedule)` → `FlexibilityScore | null`
- `countWorkingDays(start, end, schedule)` → `number` (memoized)
- `countAvailableHours(start, end, schedule)` → `number` (memoized)
- `clearFlexibilityCache()` → `void`

#### Workload Calculator (`workload-calculator.ts`)

**Purpose**: Status bar summary across all assigned issues.

```typescript
interface WorkloadSummary {
  totalEstimated: number;
  totalSpent: number;
  remaining: number;           // est - spent
  availableThisWeek: number;   // hours to Friday
  buffer: number;              // available - remaining
  topUrgent: UrgentIssue[];    // top 3 by days remaining
}
```

#### API Logger (`api-logger.ts`)

**Features**:
- Request/response formatting
- Sensitive data redaction
- Query param truncation (>100 chars)
- Binary content detection
- Body truncation (200 chars default)

### 7. Models (`src/redmine/models/`)

All models are TypeScript interfaces matching Redmine API JSON.

#### Issue (`issue.ts`)

```typescript
interface Issue {
  id: number;
  project: NamedEntity;
  tracker: NamedEntity;
  status: NamedEntity;
  priority: NamedEntity;
  author: NamedEntity;
  assigned_to: NamedEntity;
  subject: string;
  description: string;
  start_date: string;
  due_date: string | null;
  done_ratio: number;
  is_private: boolean;
  estimated_hours: number | null;
  spent_hours?: number;
  total_spent_hours?: number;
  created_on: string;
  updated_on: string;
  closed_on: string | null;
}
```

#### TimeEntry (`time-entry.ts`)

```typescript
interface TimeEntry {
  id?: number;
  issue_id: number;
  issue?: { id: number; subject: string };
  activity_id: number;
  activity?: NamedEntity;
  hours: string;
  comments: string;
  spent_on?: string;
  user?: NamedEntity;
  created_on?: string;
  updated_on?: string;
}
```

## Data Flow Diagrams

### Configuration Flow

```
Extension Activates
       │
       ▼
updateConfiguredContext()
       │
       ├─► Read workspace config (redmine.url)
       ├─► Get API key from SecretManager
       │
       ├─► Both present?
       │   │
       │   ├─► Yes: Set redmine:configured = true
       │   │        Create RedmineServer
       │   │        Set server on all trees
       │   │        Fire tree refresh events
       │   │
       │   └─► No: Set redmine:configured = false
       │           Clear servers from trees
       │
       ▼
   Trees render
   (welcome view if not configured)
```

### Issue Actions Flow

```
User clicks issue in tree
       │
       ▼
TreeItem.command triggers
       │
       ▼
"redmine.openActionsForIssue"
       │
       ├─► parseConfiguration() → ActionProperties
       │
       ├─► server.getIssueById(id)
       │
       ├─► new IssueController(issue, server)
       │
       ▼
IssueController.listActions()
       │
       ├─► showQuickPick(actions)
       │
       ▼
   User selects action
       │
       ├─► "Change status" → changeStatus()
       │   ├─► getIssueStatuses()
       │   ├─► showQuickPick(statuses)
       │   └─► setIssueStatus()
       │
       ├─► "Add time entry" → addTimeEntry()
       │   ├─► getTimeEntryActivities()
       │   ├─► showQuickPick(activities)
       │   ├─► showInputBox("hours|message")
       │   └─► addTimeEntry()
       │
       ├─► "Open in browser" → openInBrowser()
       │   └─► vscode.open(issueUrl)
       │
       └─► "Quick update" → quickUpdate()
           ├─► getMemberships() + getIssueStatuses()
           ├─► showQuickPick(statuses)
           ├─► showQuickPick(members)
           ├─► showInputBox(message)
           └─► applyQuickUpdate()
```

### Time Entry View Flow

```
MyTimeEntriesTreeDataProvider.getChildren(undefined)
       │
       ├─► Return cached if available
       │
       ├─► Set isLoading = true
       ├─► Start loadTimeEntries() (async, non-blocking)
       │
       ▼
Return [loadingNode] immediately
       │
       ▼
loadTimeEntries() (background)
       │
       ├─► Parallel fetch:
       │   ├─► getTimeEntries({ today })
       │   ├─► getTimeEntries({ week start → today })
       │   └─► getTimeEntries({ month start → today })
       │
       ├─► Calculate totals and percentages
       │
       ├─► Build group nodes with cached entries
       │
       ├─► Set cachedGroups
       ├─► Set isLoading = false
       │
       ▼
Fire onDidChangeTreeData
       │
       ▼
getChildren() returns cachedGroups
       │
       ▼
User expands group
       │
       ▼
getChildren(group)
       │
       ├─► Get unique issue IDs from entries
       ├─► Batch fetch missing issues (parallel)
       ├─► Cache issue subjects
       │
       ▼
Return entry nodes with tooltips
```

## Configuration Schema

### Extension Settings (`package.json`)

| Setting | Type | Scope | Description |
|---------|------|-------|-------------|
| `redmine.url` | string | machine | Server URL |
| `redmine.apiKey` | string | machine | **DEPRECATED** - use Secrets |
| `redmine.rejectUnauthorized` | boolean | machine | SSL validation |
| `redmine.identifier` | string | machine | Default project |
| `redmine.additionalHeaders` | object | machine | Custom headers |
| `redmine.logging.enabled` | boolean | machine | API logging |
| `redmine.workingHours.weeklySchedule` | object | application | Per-day hours |
| `redmine.workingHours.hoursPerDay` | number | application | **DEPRECATED** |
| `redmine.workingHours.workingDays` | array | application | **DEPRECATED** |
| `redmine.statusBar.showWorkload` | boolean | application | Enable workload |

### Weekly Schedule Format

```json
{
  "redmine.workingHours.weeklySchedule": {
    "Mon": 8, "Tue": 8, "Wed": 8, "Thu": 8, "Fri": 8,
    "Sat": 0, "Sun": 0
  }
}
```

### Context Variables

| Variable | Purpose |
|----------|---------|
| `redmine:configured` | Show/hide welcome views |
| `redmine:hasSingleConfig` | Show/hide server switcher |
| `redmine:treeViewStyle` | Projects view mode |

## Build System

### Build Configuration (`esbuild.cjs`)

```javascript
{
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",        // VS Code requires CommonJS
  minify: production,
  sourcemap: !production,
  platform: "node",
  outfile: "out/extension.js",
  external: ["vscode"], // VS Code provides at runtime
}
```

### TypeScript Configuration (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "module": "ES2022",
    "target": "ES2022",
    "strict": true,
    "moduleResolution": "bundler",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

### NPM Scripts

| Script | Purpose |
|--------|---------|
| `compile` | Production build |
| `watch` | Development mode |
| `typecheck` | TypeScript validation |
| `lint` | ESLint check |
| `test` | Run Vitest |
| `test:coverage` | Coverage report |
| `ci` | lint + typecheck + test:coverage |
| `package` | Create VSIX |
| `clean` | Remove artifacts |

## Testing Strategy

### Test Configuration (`vitest.config.ts`)

- **Framework**: Vitest with v8 coverage
- **Environment**: Node
- **VS Code Mock**: Aliased to `test/mocks/vscode.ts`
- **Coverage Target**: 60% (lines, functions, branches, statements)

### Test Exclusions

```typescript
exclude: [
  "src/extension.ts",           // Heavy VS Code integration
  "src/trees/**/*.ts",          // TreeDataProvider mocking complex
  "src/commands/new-issue.ts",  // UI-heavy
  "src/commands/open-actions-*.ts",
  "src/controllers/issue-controller.ts",
  "src/redmine/models/**/*.ts", // Type definitions only
  "src/definitions/**/*.ts",
]
```

### Testing Pattern for HTTP

**Dependency Injection** (avoids module mock hoisting issues):

```typescript
// Production
new RedmineServer({ address, key });

// Test
new RedmineServer({
  address, key,
  requestFn: createMockRequest()  // Injected mock
});
```

## Security Considerations

### API Key Storage

- **Location**: VS Code Secrets API (platform-native encryption)
- **Scope**: Per workspace folder
- **Sync**: Never synced to cloud
- **Migration**: Manual only (v2 → v3)

### Logging Redaction

Sensitive fields automatically redacted:
- `password`
- `api_key` / `apikey`
- `token`
- `secret`
- `auth` / `authorization`
- `key`

### Network Security

- HTTPS recommended
- `rejectUnauthorized: false` for self-signed certs (use cautiously)
- 30s request timeout prevents hangs

## Extension Points

### Adding Commands

1. Create file in `src/commands/`
2. Export default function: `(props: ActionProperties, ...args) => void`
3. Register via `registerCommand()` in `extension.ts`
4. Add to `package.json` → `contributes.commands`
5. Optionally add keybinding or menu

### Adding Tree Views

1. Create provider implementing `TreeDataProvider<T>`
2. Implement `getTreeItem()` and `getChildren()`
3. Add EventEmitter for `onDidChangeTreeData`
4. Register via `createTreeView()` in `extension.ts`
5. Add to `package.json` → `contributes.views`

### Adding API Methods

1. Add method to `RedmineServer` class
2. Use `doRequest<T>(path, method, data?)` for HTTP
3. Add model interface in `src/redmine/models/` if needed
4. Consider caching for rarely-changing data

### Adding Configuration

1. Add to `RedmineConfig` interface in `src/definitions/redmine-config.ts`
2. Add schema to `package.json` → `contributes.configuration.properties`
3. Access via `vscode.workspace.getConfiguration("redmine")`

## Performance Optimizations

### Current

| Optimization | Location | Impact |
|--------------|----------|--------|
| Server LRU cache | extension.ts:553-573 | Reuse connections |
| Status/activity caching | redmine-server.ts | Reduce API calls |
| Async tree loading | trees/*.ts | <10ms initial render |
| Working days memoization | flexibility-calculator.ts | Fast date math |
| Config change debouncing | extension.ts:232-264 | Prevent rapid updates |
| Concurrent fetch dedup | my-issues-tree.ts:143-154 | Single in-flight request |

### Key Patterns

**Non-blocking tree loading**:
```typescript
async getChildren() {
  if (cached) return cached;
  if (!isLoading) {
    isLoading = true;
    loadData();  // Don't await
  }
  return [loadingPlaceholder];
}
```

**Config change debouncing**:
```typescript
onDidChangeConfiguration((event) => {
  if (timeout) clearTimeout(timeout);
  timeout = setTimeout(async () => {
    if (shouldReinitialize(event)) {
      await updateConfiguredContext();
    }
  }, 300);
});
```

## Git Hooks

### commit-msg Hook (`scripts/commit-msg`)

**Validates**:
- Subject ≤ 50 characters
- Blank line between subject and body
- Body lines ≤ 72 characters
- Exceptions: merge commits, revert commits

**Installation**: `npm run install-hooks` or automatic via `prepare` script

## Dependencies

### Runtime

None (lodash removed in v3.0.0)

### Development

| Package | Purpose |
|---------|---------|
| typescript | Language |
| esbuild | Bundler |
| eslint | Linting |
| prettier | Formatting |
| vitest | Testing |
| @vitest/coverage-v8 | Coverage |
| @types/vscode | Type definitions |
| @types/node | Node types |
| @vscode/vsce | Packaging |
