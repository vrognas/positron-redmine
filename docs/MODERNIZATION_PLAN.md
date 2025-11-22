# Positron-Redmine v3.0.0 Modernization Plan

**Version**: 3.0.0
**Status**: Planning Complete - Ready for Implementation
**Breaking Changes**: YES (immediate hard cutoff)
**Estimated Duration**: 4-5 weeks
**Last Updated**: 2025-11-22

---

## Executive Summary

Complete modernization of positron-redmine extension with breaking changes for v3.0.0 release. Focus: security (Secrets API), reliability (repository pattern), maintainability (TypeScript 5.7, ESM), and testability (Vitest E2E).

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| **v3.0.0** | Breaking changes justified by security improvements |
| **TypeScript 3.9.7 → 5.7.2** | Direct jump, 5 years behind current |
| **ESM Migration** | Hybrid approach (ESM source, initially CJS output) |
| **Secrets API** | Machine-local storage, NO sync across machines |
| **Repository Pattern** | NOW - improves testability, decoupling |
| **VS Code 1.85+** | Required for Secrets API and modern features |
| **Vitest + E2E** | Modern testing with real Redmine server |
| **Remove lodash** | 3 usages → native JS (8KB savings) |
| **Hard cutoff** | Immediate migration, no backward compatibility |

---

## Table of Contents

1. [Pre-Implementation Audit](#1-pre-implementation-audit)
2. [Phase 0: Foundation Fixes](#2-phase-0-foundation-fixes-week-1-day-1-2)
3. [Phase 1: TypeScript 5.7 Migration](#3-phase-1-typescript-57-migration-week-1-day-3-5)
4. [Phase 2: ESM Migration](#4-phase-2-esm-migration-week-2-day-1-3)
5. [Phase 3: Repository Pattern](#5-phase-3-repository-pattern-week-2-day-4---week-3-day-2)
6. [Phase 4: Secrets API](#6-phase-4-secrets-api-migration-week-3-day-3-5)
7. [Phase 5: VS Code API Modernization](#7-phase-5-vs-code-api-modernization-week-4-day-1-2)
8. [Phase 6: Testing & CI](#8-phase-6-testing--ci-week-4-day-3-5)
9. [Phase 7: Documentation & Release](#9-phase-7-documentation--release-week-5-day-1-2)
10. [Risk Assessment](#10-risk-assessment)
11. [Rollback Strategy](#11-rollback-strategy)
12. [Success Metrics](#12-success-metrics)

---

## 1. Pre-Implementation Audit

### Current State Snapshot

**Codebase Stats**:
- 22 TypeScript files (1,437 lines)
- 0 test files
- TypeScript 3.9.7 (June 2020)
- @types/node v7 (Node.js 7 era, 2017)
- VS Code API types 1.31.0 (2019)
- 9 security vulnerabilities (4 high, 3 moderate, 2 low)

**Technical Debt**:
- url.parse() deprecated API (breaking change required)
- 6+ non-null assertions
- 4 `any` type usages with eslint-disable
- No resource cleanup (EventEmitters never disposed)
- Inconsistent async patterns (.then() vs async/await)
- High code duplication (progress indicators × 4)
- God object (IssueController 277 lines)

**Dependencies Severely Outdated**:
```
typescript: 3.9.7 → 5.7.2 (5 years)
@types/node: 7.0.43 → 22.17.10 (7 years)
@types/vscode: 1.31.0 → 1.96.0 (6 years)
eslint: 8.0.0 → 9.18.0 (1 major)
```

### Breaking Changes Required

1. **API Key Storage**: workspace config → Secrets API
2. **VS Code Engine**: 1.74.0+ → 1.85.0+
3. **TypeScript Output**: May break on 5.7 strict checks
4. **URL Parsing**: `url.parse()` → `new URL()` (behavior change)
5. **Repository Pattern**: Internal refactor may affect caching behavior

---

## 2. Phase 0: Foundation Fixes (Week 1, Day 1-2)

**Goal**: Fix critical bugs, establish testing infrastructure

### Step 0.1: Fix esbuild.js Null Access Bug ⚠️

**Issue**: `esbuild.js:43` - `location.file` accessed without null check

**Test First**:
```typescript
// test/unit/build/esbuild-plugin.test.ts
describe('esbuild problem matcher', () => {
  it('should handle null location', () => {
    const mockResult = {
      errors: [{ text: 'Error', location: null }]
    };
    // Should not throw
    expect(() => handleBuildEnd(mockResult)).not.toThrow();
  });

  it('should handle location with file', () => {
    const mockResult = {
      errors: [{ text: 'Error', location: { file: 'a.ts', line: 1, column: 5 } }]
    };
    const output = handleBuildEnd(mockResult);
    expect(output).toContain('a.ts:1:5');
  });
});
```

**Then Fix**:
```javascript
// esbuild.js:40-45
build.onEnd((result) => {
  result.errors.forEach(({ text, location }) => {
    console.error(`✘ [ERROR] ${text}`);
    if (location) {  // ADD THIS CHECK
      console.error(`    ${location.file}:${location.line}:${location.column}:`);
    }
  });
  console.log('[watch] build finished');
});
```

**Time**: 1 hour

---

### Step 0.2: Setup Vitest Infrastructure

**Dependencies to Add**:
```json
{
  "devDependencies": {
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "@vitest/ui": "^2.1.0",
    "@vscode/test-electron": "^2.4.1",
    "msw": "^2.6.0"
  }
}
```

**Files to Create**:

1. **vitest.config.ts**:
```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    alias: {
      vscode: resolve(__dirname, './test/mocks/vscode.ts'),
    },
    include: ['test/unit/**/*.test.ts'],
    exclude: ['test/e2e/**/*', 'node_modules/**/*'],
    setupFiles: ['./test/setup/setup-unit.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['test/**/*', 'out/**/*', '**/*.test.ts'],
      include: ['src/**/*.ts'],
    },
    globals: true,
    reporters: ['verbose'],
    threads: false, // VS Code extension compatibility
  },
});
```

2. **test/mocks/vscode.ts** (VS Code API mock):
```typescript
import { vi } from 'vitest';

export const window = {
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  withProgress: vi.fn((options, task) => task({ report: vi.fn() })),
  createTreeView: vi.fn(),
};

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn(),
    has: vi.fn(),
    inspect: vi.fn(),
    update: vi.fn(),
  })),
  workspaceFolders: [],
};

export const commands = {
  registerCommand: vi.fn(),
  executeCommand: vi.fn(),
};

export const Uri = {
  parse: vi.fn((url: string) => ({ toString: () => url })),
};

export const TreeItem = class {};
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export const EventEmitter = class {
  fire = vi.fn();
  event = vi.fn();
};

export const ProgressLocation = {
  Window: 1,
  Notification: 15,
};

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}
```

3. **test/setup/setup-unit.ts**:
```typescript
import { beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  // Reset mocks before each test
});

afterEach(() => {
  // Cleanup after each test
});
```

4. **test/fixtures/api-responses/issues.json**:
```json
{
  "issues": [
    {
      "id": 123,
      "subject": "Test issue",
      "status": { "id": 1, "name": "New" },
      "tracker": { "id": 1, "name": "Bug" },
      "author": { "id": 1, "name": "John Doe" },
      "project": { "id": 1, "name": "Test Project" },
      "assigned_to": { "id": 2, "name": "Jane Doe" }
    }
  ],
  "total_count": 1
}
```

**Update package.json scripts**:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "node ./test/e2e/runTests.js"
  }
}
```

**Time**: 4 hours

---

### Step 0.3: Remove lodash (Trivial Cleanup)

**Current Usage** (3 locations):
- `isNil(x)` → `x == null` (2 locations)
- `isEqual(a, b)` → `JSON.stringify(a) === JSON.stringify(b)` (1 location)

**Test First**:
```typescript
// test/unit/utilities/null-checks.test.ts
describe('isNil replacement', () => {
  it('should detect null', () => {
    expect(null == null).toBe(true);
  });

  it('should detect undefined', () => {
    expect(undefined == null).toBe(true);
  });

  it('should reject values', () => {
    expect("" == null).toBe(false);
    expect(0 == null).toBe(false);
  });
});

// test/unit/utilities/object-equality.test.ts
describe('isEqual replacement', () => {
  it('should compare simple objects', () => {
    const a = { foo: 'bar' };
    const b = { foo: 'bar' };
    expect(JSON.stringify(a) === JSON.stringify(b)).toBe(true);
  });

  it('should detect differences', () => {
    const a = { foo: 'bar' };
    const b = { foo: 'baz' };
    expect(JSON.stringify(a) === JSON.stringify(b)).toBe(false);
  });
});
```

**Then Replace**:

1. **src/trees/projects-tree.ts:6** - Remove import:
```typescript
// BEFORE
import isNil from "lodash/isNil";

// AFTER
// (remove import)
```

2. **src/trees/projects-tree.ts:60** - Replace usage:
```typescript
// BEFORE
if (!isNil(projectOrIssue) && projectOrIssue instanceof RedmineProject) {

// AFTER
if (projectOrIssue != null && projectOrIssue instanceof RedmineProject) {
```

3. **src/redmine/redmine-server.ts:17-18** - Remove imports:
```typescript
// BEFORE
import isNil from "lodash/isNil";
import isEqual from "lodash/isEqual";

// AFTER
// (remove imports)
```

4. **src/redmine/redmine-server.ts:85** - Replace isNil:
```typescript
// BEFORE
if (isNil(this.options.additionalHeaders)) {

// AFTER
if (this.options.additionalHeaders == null) {
```

5. **src/redmine/redmine-server.ts:381** - Replace isEqual:
```typescript
// BEFORE
isEqual(this.options.additionalHeaders, other.options.additionalHeaders)

// AFTER
JSON.stringify(this.options.additionalHeaders) === JSON.stringify(other.options.additionalHeaders)
```

6. **package.json** - Remove dependencies:
```json
{
  "dependencies": {
    // Remove: "lodash": "^4.17.21"
  },
  "devDependencies": {
    // Remove: "@types/lodash": "^4.14.175"
  }
}
```

**Run**: `npm uninstall lodash @types/lodash`

**Time**: 30 minutes

---

**Phase 0 Total Time**: 2 days

---

## 3. Phase 1: TypeScript 5.7 Migration (Week 1, Day 3-5)

**Goal**: Direct jump to TypeScript 5.7.2, fix all breaking changes

### Migration Dependency Order

Files must be migrated in this order (dependencies bottom-up):

**Level 1: Foundation** (no dependencies)
1. src/redmine/models/named-entity.ts
2. src/redmine/models/time-entry-activity.ts
3. src/redmine/models/issue-status.ts
4. src/utilities/error-to-string.ts
5. src/definitions/redmine-config.ts

**Level 2: Models**
6. src/redmine/models/membership.ts
7. src/redmine/models/time-entry.ts
8. src/redmine/models/issue.ts
9. src/redmine/models/project.ts

**Level 3: Domain**
10. src/controllers/domain.ts

**Level 4: Core Services** ⚠️ HIGH RISK
11. src/redmine/redmine-server.ts

**Level 5-8**: Commands, controllers, trees, extension.ts

---

### Step 1.1: Update Dependencies

**No tests needed - dependency changes only**

```bash
npm install --save-dev \
  typescript@^5.7.2 \
  @types/node@^22.17.10 \
  @types/vscode@^1.96.0

npm uninstall @types/lodash
```

**Expected**: Compilation errors immediately.

**Time**: 15 minutes

---

### Step 1.2: Fix url.parse() → new URL() Migration ⚠️ CRITICAL

**Impact**: 11 files affected

#### Test First (test/unit/redmine/url-parsing.test.ts):
```typescript
import { describe, it, expect } from 'vitest';

describe('URL parsing migration', () => {
  it('should parse http URL', () => {
    const url = new URL('http://example.com');
    expect(url.protocol).toBe('http:');
    expect(url.hostname).toBe('example.com');
  });

  it('should parse https URL', () => {
    const url = new URL('https://example.com');
    expect(url.protocol).toBe('https:');
  });

  it('should parse URL with port', () => {
    const url = new URL('http://example.com:8080');
    expect(url.port).toBe('8080');
    expect(url.hostname).toBe('example.com');
  });

  it('should parse URL with path suffix', () => {
    const url = new URL('https://example.com:8443/redmine');
    expect(url.pathname).toBe('/redmine');
    expect(url.port).toBe('8443');
  });

  it('should handle missing port with defaults', () => {
    const httpUrl = new URL('http://example.com');
    const httpsUrl = new URL('https://example.com');
    expect(httpUrl.port).toBe(''); // Empty string when default
    expect(httpsUrl.port).toBe('');
  });

  it('should throw on invalid URL', () => {
    expect(() => new URL('not-a-url')).toThrow();
  });
});
```

#### Then Implement Changes:

**1. src/redmine/redmine-server.ts** (9 changes):

```typescript
// Line 1: Remove deprecated import
// BEFORE
import { Url, parse } from "url";

// AFTER
// (remove entirely)

// Line 47: Update interface
// BEFORE
interface RedmineServerOptions extends RedmineServerConnectionOptions {
  url: Url;
}

// AFTER
interface RedmineServerOptions extends RedmineServerConnectionOptions {
  url: URL;
}

// Line 72-77: Update validateOptions
// BEFORE
const url = parse(options.address);
if (["https:", "http:"].indexOf(url.protocol ?? "") === -1) {
  throw new RedmineOptionsError(
    "Address must have supported protocol (http/https)"
  );
}

// AFTER
let url: URL;
try {
  url = new URL(options.address);
} catch (error) {
  throw new RedmineOptionsError(`Invalid URL format: ${options.address}`);
}
if (!["https:", "http:"].includes(url.protocol)) {
  throw new RedmineOptionsError(
    "Address must have supported protocol (http/https)"
  );
}

// Line 83: Update setOptions
// BEFORE
this.options = {
  ...options,
  url: parse(options.address),
};

// AFTER
this.options = {
  ...options,
  url: new URL(options.address),
};

// Line 59-63: Update protocol check (hostname compatible)
// BEFORE (line 60)
return this.options.url.protocol === "https:"

// AFTER (no change needed - URL.protocol same)
return this.options.url.protocol === "https:"

// Line 98-105: Update port handling
// BEFORE
const options: https.RequestOptions = {
  hostname: url.hostname,
  port: url.port,
  // ...
};

// AFTER
const options: https.RequestOptions = {
  hostname: url.hostname,
  port: url.port ? parseInt(url.port, 10) : undefined,
  // ...
};
```

**2. Update 4 command files** (url.host → url.hostname):

Files:
- src/commands/open-actions-for-issue.ts:37
- src/commands/new-issue.ts:31
- src/commands/commons/open-actions-for-issue-id.ts:22
- src/commands/list-open-issues-assigned-to-me.ts:36

```typescript
// BEFORE
message: `Waiting for response from ${server.options.url.host}...`

// AFTER
message: `Waiting for response from ${server.options.url.hostname}...`
```

**Note**: `URL.host` includes port (example.com:8080), `URL.hostname` doesn't (example.com). Use hostname for cleaner display.

**Time**: 3 hours

---

### Step 1.3: Fix `any` Types and Non-Null Assertions

#### Test for parseConfiguration:
```typescript
// test/unit/extension/parse-configuration.test.ts
describe('parseConfiguration type safety', () => {
  it('should handle unknown args safely', () => {
    const args: unknown[] = ['arg1', 123, { foo: 'bar' }];
    // Should not throw type errors
    expect(() => processArgs(...args)).not.toThrow();
  });
});
```

#### Changes:

**1. src/extension.ts:44-49** - any → unknown:
```typescript
// BEFORE
// eslint-disable-next-line @typescript-eslint/no-explicit-any
...args: any[]
): Promise<{
  props?: ActionProperties;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[];
}>

// AFTER
...args: unknown[]
): Promise<{
  props?: ActionProperties;
  args: unknown[];
}>
```

**2. src/extension.ts:133-140** - any → unknown:
```typescript
// BEFORE
// eslint-disable-next-line @typescript-eslint/no-explicit-any
action: (props: ActionProperties, ...args: any[]) => void

// AFTER
action: (props: ActionProperties, ...args: unknown[]) => void
```

**3. src/extension.ts:146** - Remove non-null assertion:
```typescript
// BEFORE
action(props!, ...args);

// AFTER
if (props) {
  action(props, ...args);
} else {
  console.error('Action called without props');
}
```

**4. src/utilities/error-to-string.ts:13-14** - Better typing:
```typescript
// BEFORE
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(error as any)?.message ??

// AFTER
(error as { message?: string })?.message ??
```

**5. src/redmine/redmine-server.ts:55** - Definite assignment:
```typescript
// BEFORE
options!: RedmineServerOptions;

// AFTER
options: RedmineServerOptions = {} as RedmineServerOptions;
// Note: Will be properly initialized in setOptions() called from constructor
```

**6. src/redmine/redmine-server.ts:109-110** - Type guard:
```typescript
// BEFORE
options.headers!["Content-Length"] = data.length;
options.headers!["Content-Type"] = "application/json";

// AFTER
if (options.headers) {
  options.headers["Content-Length"] = data.length;
  options.headers["Content-Type"] = "application/json";
}
```

**7. src/redmine/redmine-server.ts:143** - statusCode check:
```typescript
// BEFORE
if (statusCode! >= 400) {

// AFTER
if (statusCode && statusCode >= 400) {
```

**8. src/redmine/redmine-server.ts:159** - Type assertion:
```typescript
// BEFORE
resolve((null as unknown) as T);

// AFTER
resolve(null as T);
```

**9. src/controllers/issue-controller.ts:55-56** - Input validation:
```typescript
// BEFORE
const hours = input!.substring(0, indexOf);
const message = input!.substring(indexOf + 1);

// AFTER
if (!input) {
  vscode.window.showErrorMessage('Time entry input required');
  return;
}
const hours = input.substring(0, indexOf);
const message = input.substring(indexOf + 1);
```

**10. src/trees/projects-tree.ts:62** - Array null check:
```typescript
// BEFORE
const subprojects: (RedmineProject | Issue)[] = this.projects!.filter(

// AFTER
const subprojects: (RedmineProject | Issue)[] = (this.projects ?? []).filter(
```

**Time**: 2 hours

---

### Step 1.4: Update tsconfig.json

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "out",
    "lib": ["ES2022"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,

    // NEW: Modern TS 5.7 options
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": false
  },
  "exclude": ["node_modules", ".vscode-test", "out", "test"]
}
```

**Time**: 15 minutes

---

### Step 1.5: Verify Build

```bash
npm run compile
# Should succeed with 0 errors

npm run lint
# Fix any new linting issues
```

**Time**: 30 minutes

---

**Phase 1 Total Time**: 3 days

---

## 4. Phase 2: ESM Migration (Week 2, Day 1-3)

**Goal**: Modernize to ESM (source), keep CJS output initially

### Step 2.1: Update tsconfig.json for ESM

```json
{
  "compilerOptions": {
    "module": "ES2022",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    // ... rest unchanged
  }
}
```

**Test**: Compilation should still work.

**Time**: 15 minutes

---

### Step 2.2: Rename esbuild.js → esbuild.cjs

**Keep CJS output for safety**:

```javascript
// esbuild.cjs (renamed from esbuild.js)
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs', // KEEP CJS for compatibility
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

// Fixed problem matcher plugin (from Phase 0)
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log('[watch] build finished');
    });
  },
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
```

**Update package.json scripts**:
```json
{
  "scripts": {
    "compile": "node esbuild.cjs --production",
    "watch": "node esbuild.cjs --watch"
  }
}
```

**Time**: 30 minutes

---

### Step 2.3: Update package.json Main Field

```json
{
  "main": "./out/extension.js",
  "engines": {
    "vscode": "^1.85.0",
    "positron": "^2025.06.0"
  }
}
```

**Time**: 15 minutes

---

### Step 2.4: Test Extension Activation

**E2E Test** (test/e2e/activation.test.ts):
```typescript
import * as vscode from 'vscode';
import { describe, it, before } from 'mocha';
import { expect } from 'chai';

describe('Extension Activation E2E', () => {
  before(async function() {
    this.timeout(10000);
    const ext = vscode.extensions.getExtension('vrognas.positron-redmine');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  it('should activate without errors', () => {
    const ext = vscode.extensions.getExtension('vrognas.positron-redmine');
    expect(ext).to.not.be.undefined;
    expect(ext?.isActive).to.be.true;
  });

  it('should register all commands', async () => {
    const commands = await vscode.commands.getCommands();
    expect(commands).to.include('redmine.listOpenIssuesAssignedToMe');
    expect(commands).to.include('redmine.openActionsForIssue');
    expect(commands).to.include('redmine.newIssue');
  });

  it('should create tree views', () => {
    // Tree views should be registered
    // Note: Can't directly access tree views, verify via sidebar
  });
});
```

**Run**: `npm run test:e2e` (manual verification in VS Code)

**Time**: 2 days (includes manual testing)

---

**Phase 2 Total Time**: 3 days

---

## 5. Phase 3: Repository Pattern (Week 2, Day 4 - Week 3, Day 2)

**Goal**: Implement repository pattern for testability and decoupling

### Architecture Overview

```
src/
├── repositories/
│   ├── interfaces/
│   │   ├── IIssueRepository.ts
│   │   ├── IProjectRepository.ts
│   │   └── IRepositoryFactory.ts
│   ├── redmine/
│   │   ├── RedmineIssueRepository.ts
│   │   ├── RedmineProjectRepository.ts
│   │   └── RedmineRepositoryFactory.ts
│   └── mock/
│       ├── MockIssueRepository.ts
│       ├── MockProjectRepository.ts
│       └── MockRepositoryFactory.ts
├── di/
│   └── ServiceContainer.ts
└── ... (existing)
```

---

### Step 3.1: Create Repository Interfaces

**Test First** (test/unit/repositories/interfaces.test.ts):
```typescript
describe('IIssueRepository interface', () => {
  it('should define getById method', () => {
    // Type test
    type Test = IIssueRepository['getById'];
    const test: Test = {} as Test;
    expect(test).toBeDefined();
  });

  // ... type tests for all methods
});
```

**Create**:

1. **src/repositories/interfaces/IIssueRepository.ts**:
```typescript
import { Issue } from "../../redmine/models/issue";
import { IssueStatus } from "../../redmine/models/issue-status";
import { TimeEntryActivity } from "../../redmine/models/time-entry-activity";

export interface IIssueRepository {
  getById(issueId: number): Promise<Issue>;
  getAssignedToMe(): Promise<Issue[]>;
  getOpenForProject(projectId: number | string, includeSubprojects?: boolean): Promise<Issue[]>;
  updateStatus(issueId: number, statusId: number): Promise<void>;
  getStatuses(): Promise<IssueStatus[]>;
  addTimeEntry(issueId: number, activityId: number, hours: string, message: string): Promise<void>;
  getTimeEntryActivities(): Promise<TimeEntryActivity[]>;
  applyQuickUpdate(update: QuickUpdateRequest): Promise<QuickUpdateResult>;
}

export interface QuickUpdateRequest {
  issueId: number;
  statusId: number;
  assigneeId: number;
  message: string;
}

export interface QuickUpdateResult {
  success: boolean;
  differences: string[];
}
```

2. **src/repositories/interfaces/IProjectRepository.ts**:
```typescript
import { RedmineProject } from "../../redmine/redmine-project";
import { Membership } from "../../controllers/domain";

export interface IProjectRepository {
  getAll(): Promise<RedmineProject[]>;
  getById(projectId: number): Promise<RedmineProject>;
  getMemberships(projectId: number): Promise<Membership[]>;
}
```

3. **src/repositories/interfaces/IRepositoryFactory.ts**:
```typescript
import { IIssueRepository } from "./IIssueRepository";
import { IProjectRepository } from "./IProjectRepository";

export interface IRepositoryFactory {
  createIssueRepository(): IIssueRepository;
  createProjectRepository(): IProjectRepository;
}
```

**Time**: 2 hours

---

### Step 3.2: Implement Redmine Repositories

**Test First** (test/unit/repositories/redmine-issue-repository.test.ts):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedmineIssueRepository } from '../../../src/repositories/redmine/RedmineIssueRepository';
import { RedmineServer } from '../../../src/redmine/redmine-server';

describe('RedmineIssueRepository', () => {
  let server: RedmineServer;
  let repo: RedmineIssueRepository;

  beforeEach(() => {
    server = {
      getIssueById: vi.fn(),
      getIssuesAssignedToMe: vi.fn(),
      // ... other mocked methods
    } as unknown as RedmineServer;

    repo = new RedmineIssueRepository(server);
  });

  it('should get issue by ID', async () => {
    const mockIssue = { id: 123, subject: 'Test' };
    vi.mocked(server.getIssueById).mockResolvedValue({ issue: mockIssue });

    const result = await repo.getById(123);

    expect(result).toEqual(mockIssue);
    expect(server.getIssueById).toHaveBeenCalledWith(123);
  });

  // ... more tests
});
```

**Then Implement** (3 repository files):

1. src/repositories/redmine/RedmineIssueRepository.ts (see detailed implementation in subagent output)
2. src/repositories/redmine/RedmineProjectRepository.ts
3. src/repositories/redmine/RedmineRepositoryFactory.ts

**Time**: 1 day

---

### Step 3.3: Create Mock Repositories

**Test** (test/unit/repositories/mock-issue-repository.test.ts):
```typescript
describe('MockIssueRepository', () => {
  let repo: MockIssueRepository;

  beforeEach(() => {
    repo = new MockIssueRepository();
  });

  it('should store and retrieve issues', async () => {
    const issue = { id: 1, subject: 'Test' } as Issue;
    repo.addIssue(issue);

    const result = await repo.getById(1);
    expect(result).toEqual(issue);
  });

  it('should throw on missing issue', async () => {
    await expect(repo.getById(999)).rejects.toThrow('Issue 999 not found');
  });
});
```

**Then Implement** (3 mock files - see detailed implementation in subagent output)

**Time**: 4 hours

---

### Step 3.4: Update ActionProperties Interface

```typescript
// src/commands/action-properties.ts
import { RedmineServer } from "../redmine/redmine-server";
import { RedmineConfig } from "../definitions/redmine-config";
import { IRepositoryFactory } from "../repositories/interfaces";

export interface ActionProperties {
  server: RedmineServer; // Keep for backwards compatibility
  config: RedmineConfig;
  repositoryFactory: IRepositoryFactory; // NEW
}
```

**Time**: 15 minutes

---

### Step 3.5: Update Commands to Use Repositories

**Test First** (test/unit/commands/list-open-issues.test.ts):
```typescript
describe('listOpenIssuesAssignedToMe', () => {
  it('should use repository to fetch issues', async () => {
    const mockFactory = new MockRepositoryFactory();
    const mockIssue = { id: 1, subject: 'Test' } as Issue;
    mockFactory.issueRepository.addIssue(mockIssue);

    const props = {
      repositoryFactory: mockFactory,
      server: {} as RedmineServer,
      config: {} as RedmineConfig,
    };

    await listOpenIssuesAssignedToMe(props);

    // Verify repository was called
    expect(mockFactory.issueRepository.getAssignedToMe).toHaveBeenCalled();
  });
});
```

**Then Update Commands** (example for list-open-issues-assigned-to-me.ts):
```typescript
export default async ({ server, repositoryFactory }: ActionProperties) => {
  const issueRepo = repositoryFactory.createIssueRepository();
  const projectRepo = repositoryFactory.createProjectRepository();

  const promise = issueRepo.getAssignedToMe();

  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window },
    (progress) => {
      progress.report({
        message: `Waiting for response from ${server.options.url.hostname}...`,
      });
      return promise;
    }
  );

  try {
    const issues = await promise;

    const issue = await vscode.window.showQuickPick(
      issues.map(mapIssueToPickItem)
    );

    if (issue === undefined) return;

    const controller = new IssueController(
      issue.fullIssue,
      issueRepo,
      projectRepo,
      server.options.address
    );

    controller.listActions();
  } catch (error) {
    vscode.window.showErrorMessage(errorToString(error));
  }
};
```

**Update 6 command files total**.

**Time**: 1 day

---

### Step 3.6: Update IssueController

```typescript
// src/controllers/issue-controller.ts
export class IssueController {
  constructor(
    private issue: Issue,
    private issueRepo: IIssueRepository,
    private projectRepo: IProjectRepository,
    private serverAddress: string
  ) {}

  // Update all methods to use this.issueRepo instead of redmineServer
  private changeStatus() {
    this.issueRepo.getStatuses().then((statuses) => {
      this.changeIssueStatus(statuses);
    });
  }

  private async quickUpdate() {
    let memberships: Membership[];
    try {
      memberships = await this.projectRepo.getMemberships(this.issue.project.id);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not get memberships of project ${this.issue.project.name}`
      );
      return;
    }
    // ... rest using repositories
  }
}
```

**Time**: 4 hours

---

### Step 3.7: Update Tree Providers

```typescript
// src/trees/my-issues-tree.ts
export class MyIssuesTree implements vscode.TreeDataProvider<Issue> {
  private issueRepo: IIssueRepository;
  server: RedmineServer;

  constructor() {
    const config = vscode.workspace.getConfiguration("redmine") as RedmineConfig;
    this.server = new RedmineServer({
      address: config.url,
      key: config.apiKey,
      additionalHeaders: config.additionalHeaders,
      rejectUnauthorized: config.rejectUnauthorized,
    });

    const factory = new RedmineRepositoryFactory(this.server);
    this.issueRepo = factory.createIssueRepository();
  }

  async getChildren(_element?: Issue): Promise<Issue[]> {
    return this.issueRepo.getAssignedToMe();
  }

  setServer(server: RedmineServer) {
    this.server = server;
    const factory = new RedmineRepositoryFactory(server);
    this.issueRepo = factory.createIssueRepository();
  }
}
```

**Update 2 tree files**.

**Time**: 2 hours

---

### Step 3.8: Update extension.ts

```typescript
// src/extension.ts
import { RedmineRepositoryFactory } from "./repositories/redmine";

const parseConfiguration = async (...): Promise<{ props?: ActionProperties }> => {
  // ... existing config parsing ...

  const server = new RedmineServer({ ... });
  const repositoryFactory = new RedmineRepositoryFactory(server);

  return {
    props: {
      server,
      config,
      repositoryFactory, // NEW
    },
    args: [],
  };
};
```

**Time**: 1 hour

---

**Phase 3 Total Time**: 5 days

---

## 6. Phase 4: Secrets API Migration (Week 3, Day 3-5)

**Goal**: Migrate API keys to machine-local VS Code secrets

### Key Strategy

**Secret Key Pattern**:
```
redmine:{workspaceUriHex}:apiKey:v1
Example: "redmine:66696c653a2f2f2f686f6d652f757365722f70726f6a656374:apiKey:v1"
```

**No Sync**: VS Code Secrets API automatically excludes from Settings Sync.

---

### Step 4.1: Create SecretManager Utility

**Test First** (test/unit/utilities/secret-manager.test.ts):
```typescript
describe('RedmineSecretManager', () => {
  let context: vscode.ExtensionContext;
  let manager: RedmineSecretManager;

  beforeEach(() => {
    context = {
      secrets: {
        get: vi.fn(),
        store: vi.fn(),
        delete: vi.fn(),
        onDidChange: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;

    manager = new RedmineSecretManager(context);
  });

  it('should build secret key from workspace URI', () => {
    const uri = vscode.Uri.parse('file:///home/user/project');
    const key = manager['buildKey'](uri, 'apiKey');
    expect(key).toContain('redmine:');
    expect(key).toContain(':apiKey:v1');
  });

  it('should store API key', async () => {
    const uri = vscode.Uri.parse('file:///home/user/project');
    await manager.setApiKey(uri, 'test-key-123');

    expect(context.secrets.store).toHaveBeenCalledWith(
      expect.stringContaining('redmine:'),
      'test-key-123'
    );
  });

  it('should retrieve API key', async () => {
    const uri = vscode.Uri.parse('file:///home/user/project');
    vi.mocked(context.secrets.get).mockResolvedValue('test-key-123');

    const key = await manager.getApiKey(uri);
    expect(key).toBe('test-key-123');
  });
});
```

**Then Implement** (src/utilities/secret-manager.ts):
```typescript
import * as vscode from 'vscode';

export class RedmineSecretManager {
  constructor(private context: vscode.ExtensionContext) {}

  private buildKey(folderUri: vscode.Uri, field: string): string {
    const encoded = Buffer.from(folderUri.toString()).toString('hex');
    return `redmine:${encoded}:${field}:v1`;
  }

  async getApiKey(folderUri: vscode.Uri): Promise<string | undefined> {
    const key = this.buildKey(folderUri, 'apiKey');

    try {
      return await this.context.secrets.get(key);
    } catch (err) {
      console.error('Failed to retrieve API key:', err);
      return undefined;
    }
  }

  async setApiKey(folderUri: vscode.Uri, apiKey: string): Promise<void> {
    const key = this.buildKey(folderUri, 'apiKey');

    try {
      await this.context.secrets.store(key, apiKey);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to store API key: ${err instanceof Error ? err.message : 'unknown'}`
      );
      throw err;
    }
  }

  async deleteApiKey(folderUri: vscode.Uri): Promise<void> {
    const key = this.buildKey(folderUri, 'apiKey');
    await this.context.secrets.delete(key);
  }

  onSecretChanged(callback: (key: string) => void): vscode.Disposable {
    return this.context.secrets.onDidChange((event) => {
      if (event.key.startsWith('redmine:')) {
        callback(event.key);
      }
    });
  }
}
```

**Time**: 4 hours

---

### Step 4.2: Create Migration Command

**Test** (test/unit/commands/migrate-api-keys.test.ts):
```typescript
describe('migrateApiKeys command', () => {
  it('should detect workspace config keys', async () => {
    const config = {
      get: vi.fn(() => 'old-api-key'),
    };

    const detected = await detectDeprecatedKeys(config);
    expect(detected).toBe(true);
  });

  it('should migrate to secrets', async () => {
    const secretManager = new RedmineSecretManager(mockContext);
    const uri = vscode.Uri.parse('file:///test');

    await migrateKey(secretManager, uri, 'old-key');

    const retrieved = await secretManager.getApiKey(uri);
    expect(retrieved).toBe('old-key');
  });
});
```

**Then Implement** (src/commands/migrate-api-keys.ts):
```typescript
import * as vscode from 'vscode';
import { RedmineSecretManager } from '../utilities/secret-manager';

export async function migrateApiKeys(context: vscode.ExtensionContext): Promise<void> {
  const secretManager = new RedmineSecretManager(context);
  const workspaceFolders = vscode.workspace.workspaceFolders || [];

  for (const folder of workspaceFolders) {
    const config = vscode.workspace.getConfiguration('redmine', folder.uri);
    const oldApiKey = config.get<string>('apiKey');

    if (oldApiKey) {
      const migrate = await vscode.window.showWarningMessage(
        `API key found in ${folder.name} settings. Migrate to secure machine-local storage?`,
        'Migrate',
        'Skip'
      );

      if (migrate === 'Migrate') {
        try {
          await secretManager.setApiKey(folder.uri, oldApiKey);
          await config.update('apiKey', undefined, vscode.ConfigurationTarget.WorkspaceFolder);

          vscode.window.showInformationMessage(
            `API key for ${folder.name} migrated to secure storage`
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `Migration failed for ${folder.name}: ${err instanceof Error ? err.message : 'unknown'}`
          );
        }
      }
    }
  }
}
```

**Register in extension.ts**:
```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('redmine.migrateApiKeys', () => migrateApiKeys(context))
);
```

**Time**: 3 hours

---

### Step 4.3: Create Set API Key Command

**Implement** (src/commands/set-api-key.ts):
```typescript
import * as vscode from 'vscode';
import { RedmineSecretManager } from '../utilities/secret-manager';

export async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
  const secretManager = new RedmineSecretManager(context);

  // Pick workspace folder
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  let folder: vscode.WorkspaceFolder;
  if (folders.length === 1) {
    folder = folders[0];
  } else {
    const picked = await vscode.window.showWorkspaceFolderPick();
    if (!picked) return;
    folder = picked;
  }

  // Prompt for API key
  const apiKey = await vscode.window.showInputBox({
    prompt: `Enter Redmine API Key for ${folder.name}`,
    password: true,
    validateInput: (value) => {
      if (!value) return 'API key cannot be empty';
      if (value.length < 32) return 'API key appears invalid (too short)';
      return null;
    }
  });

  if (!apiKey) return;

  // Store in secrets
  await secretManager.setApiKey(folder.uri, apiKey);

  vscode.window.showInformationMessage(
    `API key for ${folder.name} stored securely`
  );
}
```

**Register in package.json**:
```json
{
  "contributes": {
    "commands": [
      {
        "command": "redmine.setApiKey",
        "title": "Redmine: Set API Key"
      },
      {
        "command": "redmine.migrateApiKeys",
        "title": "Redmine: Migrate API Keys to Secrets"
      }
    ]
  }
}
```

**Time**: 2 hours

---

### Step 4.4: Update parseConfiguration for Secrets

```typescript
// src/extension.ts
export function activate(context: vscode.ExtensionContext): void {
  const secretManager = new RedmineSecretManager(context);

  // Listen for secret changes
  secretManager.onSecretChanged((key) => {
    console.log('Secret updated:', key);
    projectsTree.onDidChangeTreeData$.fire();
    myIssuesTree.onDidChangeTreeData$.fire();
  });

  const parseConfiguration = async (
    withPick = true,
    props?: ActionProperties,
    ...args: unknown[]
  ): Promise<{
    props?: ActionProperties;
    args: unknown[];
  }> => {
    if (!withPick) {
      return Promise.resolve({ props, args });
    }

    const pickedFolder = await vscode.window.showWorkspaceFolderPick();
    if (!pickedFolder) {
      return Promise.resolve({ props: undefined, args: [] });
    }

    const config = vscode.workspace.getConfiguration("redmine", pickedFolder.uri);

    // Try secrets first, fallback to config
    let apiKey = await secretManager.getApiKey(pickedFolder.uri);

    if (!apiKey) {
      // Check old config location
      apiKey = config.get<string>('apiKey');

      if (apiKey) {
        // Auto-migrate on first use
        await secretManager.setApiKey(pickedFolder.uri, apiKey);
        vscode.window.showInformationMessage(
          'API key auto-migrated to secure storage'
        );
      } else {
        // Prompt user
        vscode.window.showErrorMessage(
          'No API key configured. Run "Redmine: Set API Key" command.'
        );
        return Promise.resolve({ props: undefined, args: [] });
      }
    }

    const redmineServer = new RedmineServer({
      address: config.url,
      key: apiKey,
      additionalHeaders: config.additionalHeaders,
      rejectUnauthorized: config.rejectUnauthorized,
    });

    const fromBucket = bucket.servers.find((s) => s.compare(redmineServer));
    const server = fromBucket || redmineServer;

    if (!fromBucket) {
      bucket.servers.push(server);
    }

    const repositoryFactory = new RedmineRepositoryFactory(server);

    return {
      props: {
        server,
        config,
        repositoryFactory,
      },
      args: [],
    };
  };

  // ... rest of activate
}
```

**Time**: 3 hours

---

### Step 4.5: Update Tree Providers for Async Init

**Refactor trees to lazy-load API key**:

```typescript
// src/trees/my-issues-tree.ts
export class MyIssuesTree implements vscode.TreeDataProvider<Issue> {
  private issueRepo: IIssueRepository | null = null;
  private secretManager: RedmineSecretManager;
  server: RedmineServer | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.secretManager = new RedmineSecretManager(context);
  }

  async getChildren(_element?: Issue): Promise<Issue[]> {
    // Lazy initialization
    if (!this.issueRepo) {
      await this.initialize();
    }

    if (!this.issueRepo) {
      return [];
    }

    return this.issueRepo.getAssignedToMe();
  }

  private async initialize(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;

    const folder = folders[0]; // Default to first folder
    const config = vscode.workspace.getConfiguration("redmine", folder.uri);

    let apiKey = await this.secretManager.getApiKey(folder.uri);

    if (!apiKey) {
      apiKey = config.get<string>('apiKey');
      if (apiKey) {
        await this.secretManager.setApiKey(folder.uri, apiKey);
      } else {
        return; // No key configured
      }
    }

    this.server = new RedmineServer({
      address: config.url,
      key: apiKey,
      additionalHeaders: config.additionalHeaders,
      rejectUnauthorized: config.rejectUnauthorized,
    });

    const factory = new RedmineRepositoryFactory(this.server);
    this.issueRepo = factory.createIssueRepository();
  }

  async setServer(server: RedmineServer) {
    this.server = server;
    const factory = new RedmineRepositoryFactory(server);
    this.issueRepo = factory.createIssueRepository();
  }
}
```

**Update extension.ts tree initialization**:
```typescript
const myIssuesTree = new MyIssuesTree(context);
const projectsTree = new ProjectsTree(context);
```

**Time**: 4 hours

---

### Step 4.6: Update package.json Configuration

**Deprecate apiKey field**:
```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "redmine.apiKey": {
          "type": "string",
          "description": "DEPRECATED: Use 'Redmine: Set API Key' command instead",
          "deprecationMessage": "API keys are now stored securely in VS Code secrets. Run 'Redmine: Migrate API Keys' to migrate.",
          "scope": "resource"
        }
      }
    }
  }
}
```

**Time**: 30 minutes

---

**Phase 4 Total Time**: 3 days

---

## 7. Phase 5: VS Code API Modernization (Week 4, Day 1-2)

**Goal**: Use VS Code 1.85+ features, remove deprecated APIs

### Step 5.1: Remove Deprecated activationEvents

**package.json**:
```json
{
  // DELETE ENTIRE SECTION (lines 20-29)
  // "activationEvents": [...]

  // Extension now activates on first command/view use (lazy activation)
}
```

**Test**: Verify extension still activates on first use.

**Time**: 30 minutes

---

### Step 5.2: Replace ProgressLocation.Window

**4 files to update**:

```typescript
// BEFORE
vscode.window.withProgress(
  { location: vscode.ProgressLocation.Window },

// AFTER
vscode.window.withProgress(
  { location: vscode.ProgressLocation.Notification },
```

**Files**:
- src/commands/open-actions-for-issue.ts:37
- src/commands/new-issue.ts:31
- src/commands/commons/open-actions-for-issue-id.ts:22
- src/commands/list-open-issues-assigned-to-me.ts:36

**Time**: 30 minutes

---

### Step 5.3: Add Resource Cleanup

**Test** (test/unit/lifecycle.test.ts):
```typescript
describe('Extension lifecycle', () => {
  it('should dispose EventEmitters on deactivate', () => {
    const disposeSpy = vi.fn();
    myIssuesTree.onDidChangeTreeData$ = { dispose: disposeSpy } as any;

    deactivate();

    expect(disposeSpy).toHaveBeenCalled();
  });
});
```

**Update extension.ts**:
```typescript
// Store disposables
let myIssuesTreeView: vscode.TreeView<Issue>;
let projectsTreeView: vscode.TreeView<RedmineProject | Issue>;

export function activate(context: vscode.ExtensionContext): void {
  // ... existing code ...

  myIssuesTreeView = vscode.window.createTreeView("redmine-explorer-my-issues", {
    treeDataProvider: myIssuesTree,
  });

  projectsTreeView = vscode.window.createTreeView("redmine-explorer-projects", {
    treeDataProvider: projectsTree,
  });

  context.subscriptions.push(myIssuesTreeView);
  context.subscriptions.push(projectsTreeView);
}

export function deactivate(): void {
  // Dispose EventEmitters
  myIssuesTree.onDidChangeTreeData$.dispose();
  projectsTree.onDidChangeTreeData$.dispose();

  // TreeViews auto-disposed via context.subscriptions
}
```

**Time**: 2 hours

---

### Step 5.4: QuickPick Enhancements (Optional)

**Add title and separators**:

```typescript
// src/controllers/issue-controller.ts
const activities = await this.issueRepo.getTimeEntryActivities();

const items = [
  { label: 'Development Activities', kind: vscode.QuickPickItemKind.Separator },
  ...activities.filter(a => a.isDevelopment).map(a => ({
    label: a.name,
    fullActivity: a,
  })),
  { label: 'Other Activities', kind: vscode.QuickPickItemKind.Separator },
  ...activities.filter(a => !a.isDevelopment).map(a => ({
    label: a.name,
    fullActivity: a,
  })),
];

vscode.window.showQuickPick(items, {
  title: 'Select Time Entry Activity', // NEW
  placeHolder: 'Pick an activity type',
});
```

**Time**: 1 day (optional, low priority)

---

**Phase 5 Total Time**: 2 days

---

## 8. Phase 6: Testing & CI (Week 4, Day 3-5)

**Goal**: 80%+ test coverage, CI with real Redmine

### Step 6.1: Write Unit Tests

**Target Coverage**: 80%+

**Test Suites**:

1. **test/unit/redmine/redmine-server.test.ts** (critical):
```typescript
describe('RedmineServer', () => {
  let server: RedmineServer;
  let httpServer: Server;

  beforeEach(() => {
    // Setup MSW mock server
    httpServer = setupServer(
      http.get('http://localhost:3000/issues.json', () => {
        return HttpResponse.json(require('../../fixtures/api-responses/issues.json'));
      })
    );
    httpServer.listen();

    server = new RedmineServer({
      address: 'http://localhost:3000',
      key: 'test-key',
    });
  });

  afterEach(() => {
    httpServer.close();
  });

  describe('getIssuesAssignedToMe', () => {
    it('should fetch issues for current user', async () => {
      const result = await server.getIssuesAssignedToMe();
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].subject).toBe('Test issue');
    });
  });

  describe('updateStatus', () => {
    it('should send PUT request with new status', async () => {
      const issue = { id: 123 } as Issue;
      await server.setIssueStatus(issue, 2);
      // Verify request made
    });
  });

  // ... 30+ more tests
});
```

2. **test/unit/controllers/issue-controller.test.ts**:
```typescript
describe('IssueController', () => {
  let controller: IssueController;
  let mockFactory: MockRepositoryFactory;

  beforeEach(() => {
    mockFactory = new MockRepositoryFactory();
    controller = new IssueController(
      testIssue,
      mockFactory.createIssueRepository(),
      mockFactory.createProjectRepository(),
      'http://test.redmine.com'
    );
  });

  it('should fetch statuses on changeStatus', async () => {
    await controller.changeStatus();
    // Verify getStatuses called
  });

  // ... 15+ tests
});
```

3. **test/unit/commands/*.test.ts** (8 command files)
4. **test/unit/trees/*.test.ts** (2 tree providers)
5. **test/unit/repositories/*.test.ts** (repository implementations)

**Time**: 2 days

---

### Step 6.2: E2E Tests with Real Redmine

**Docker Compose Setup** (.github/docker-compose.test.yml):
```yaml
version: '3.8'

services:
  redmine:
    image: redmine:5.1-alpine
    ports:
      - "3000:3000"
    environment:
      REDMINE_DB_MYSQL: mysql
      REDMINE_DB_HOST: mysql
      REDMINE_DB_USERNAME: redmine
      REDMINE_DB_PASSWORD: redmine
      REDMINE_DB_DATABASE: redmine
    depends_on:
      mysql:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 10s
      timeout: 5s
      retries: 30

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: redmine
      MYSQL_USER: redmine
      MYSQL_PASSWORD: redmine
    healthcheck:
      test: ["CMD", "mysqladmin", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10
```

**E2E Test Suite** (test/e2e/workflows.test.ts):
```typescript
describe('Issue Workflow E2E', function() {
  this.timeout(30000);

  let server: RedmineServer;
  let fixture: TestFixture;

  before(async () => {
    server = new RedmineServer({
      address: process.env.REDMINE_TEST_URL!,
      key: process.env.REDMINE_TEST_API_KEY!,
    });

    fixture = await setupTestFixture(server);
  });

  after(async () => {
    await cleanupTestFixture(server, fixture);
  });

  it('should list → select → update issue status', async () => {
    const issues = await server.getIssuesAssignedToMe();
    expect(issues.issues).to.have.length.greaterThan(0);

    const issue = issues.issues[0];
    await server.setIssueStatus(issue, 2);

    const updated = await server.getIssueById(issue.id);
    expect(updated.issue.status.id).to.equal(2);
  });

  it('should add time entry', async () => {
    const issueId = fixture.issueIds[0];
    await server.addTimeEntry(issueId, 9, '1.5', 'Test entry');
    // Verify entry created
  });
});
```

**Time**: 1.5 days

---

### Step 6.3: Setup GitHub Actions CI

**.github/workflows/ci.yml**:
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Unit tests
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage/coverage-final.json

  e2e:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: redmine
          MYSQL_USER: redmine
          MYSQL_PASSWORD: redmine
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3
        ports:
          - 3306:3306

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Start Redmine
        run: |
          docker run -d \
            --name redmine-test \
            -p 3000:3000 \
            -e REDMINE_DB_MYSQL=mysql \
            -e REDMINE_DB_HOST=host.docker.internal \
            -e REDMINE_DB_USERNAME=redmine \
            -e REDMINE_DB_PASSWORD=redmine \
            redmine:5.1-alpine

          # Wait for readiness
          for i in {1..60}; do
            if curl -f http://localhost:3000 2>/dev/null; then
              echo "Redmine ready"
              break
            fi
            sleep 2
          done

      - name: Run E2E tests
        env:
          REDMINE_TEST_URL: http://localhost:3000
          REDMINE_TEST_API_KEY: ${{ secrets.REDMINE_TEST_API_KEY }}
        run: npm run test:e2e

      - name: Stop Redmine
        if: always()
        run: docker stop redmine-test || true
```

**Time**: 1 day

---

**Phase 6 Total Time**: 5 days

---

## 9. Phase 7: Documentation & Release (Week 5, Day 1-2)

**Goal**: Update docs, create migration guide, release v3.0.0

### Step 7.1: Create MIGRATION_GUIDE.md

**Content** (see detailed guide in subagent output)

**Time**: 2 hours

---

### Step 7.2: Update CHANGELOG.md

**Top section**:
```markdown
# Changelog

## [3.0.0] - 2025-11-22

### BREAKING CHANGES

#### 🔐 API Key Storage Changed
- API keys now stored in VS Code Secrets (machine-local, encrypted)
- Old `redmine.apiKey` in settings deprecated
- **Migration**: Run "Redmine: Migrate API Keys" command

#### 📦 VS Code 1.85+ Required
- Minimum version: 1.74.0 → **1.85.0**
- Reason: Secrets API support

#### 🚀 TypeScript & ESM
- TypeScript 3.9.7 → 5.7.2
- ESM output for better tree-shaking
- Bundle size reduced ~80KB

#### 🏗️ Architecture Improvements
- Repository pattern implemented (internal)
- Better error handling
- Resource cleanup fixed

### Added
- `redmine.setApiKey` command
- `redmine.migrateApiKeys` command
- Comprehensive test suite (80%+ coverage)
- CI with E2E tests

### Removed
- lodash dependency
- Deprecated activationEvents
- ProgressLocation.Window (→ Notification)

### Fixed
- Memory leaks (EventEmitter disposal)
- Non-null assertion errors
- URL parsing edge cases

### Migration Required
See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
```

**Time**: 1 hour

---

### Step 7.3: Update README.md

**Update requirements section**:
```markdown
## Requirements

- **VS Code**: 1.85.0 or later
- **Positron**: Latest version
- **Redmine**: REST API enabled
- **API Key**: From Redmine account settings

## Quick Start

1. Install extension
2. Run: `Redmine: Set API Key`
3. Enter Redmine URL and API key
4. Done!

## Security

API keys stored in VS Code Secrets (machine-local, encrypted). Never committed to git.

## Migrating from v2.x

See [Migration Guide](./MIGRATION_GUIDE.md).
```

**Time**: 30 minutes

---

### Step 7.4: Update ARCHITECTURE.md

**Add sections**:
- Repository pattern architecture
- Secrets API flow
- Testing strategy

**Time**: 1 hour

---

### Step 7.5: Update package.json Metadata

```json
{
  "version": "3.0.0",
  "engines": {
    "vscode": "^1.85.0",
    "positron": "^2025.06.0"
  }
}
```

**Time**: 5 minutes

---

### Step 7.6: Create GitHub Release

**Tag**: v3.0.0

**Release Notes** (see template in subagent output)

**Time**: 30 minutes

---

### Step 7.7: Publish to Marketplace

```bash
npm run package
npx @vscode/vsce publish
```

**Time**: 30 minutes

---

**Phase 7 Total Time**: 2 days

---

## 10. Risk Assessment

### Critical Risks (P0 - Must Mitigate)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **TypeScript 5.7 breaks build** | High | Medium | Incremental migration, extensive testing |
| **url.parse() edge cases** | High | Medium | Comprehensive URL test suite (10+ cases) |
| **Secrets API unavailable (Linux)** | High | Low | Error handling, fallback prompts |
| **Lost API keys during migration** | Critical | Low | Backup prompt, no auto-delete |
| **Extension fails to activate** | Critical | Low | E2E activation tests |

### High Risks (P1 - Monitor Closely)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Positron ESM incompatibility** | High | Medium | Test in Positron early |
| **Async tree init breaks UI** | Medium | Medium | Lazy loading pattern tested |
| **Repository refactor changes behavior** | Medium | Low | Preserve exact API call patterns |
| **CI Redmine setup fails** | Low | High | Docker health checks, retries |

### Medium Risks (P2 - Accept)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Users miss migration guide** | Medium | Medium | In-extension notification |
| **Test coverage gaps** | Low | Medium | 80% threshold enforced |
| **Documentation outdated** | Low | Low | Review all docs in Phase 7 |

---

## 11. Rollback Strategy

### If Migration Fails Mid-Phase

**Phase 0-2**: Revert commits, restore package.json
```bash
git reset --hard <commit-before-phase-0>
npm install
```

**Phase 3-4**: Repository pattern isolated, can disable:
```typescript
// Temporarily bypass repositories
const useRepositories = false;
if (useRepositories) {
  // new code
} else {
  // old direct server calls
}
```

**Phase 5-6**: Non-breaking, can revert individual commits

**Phase 7**: Cannot rollback after marketplace publish. Use hotfix v3.0.1.

### Emergency Hotfix Process

1. Create branch `hotfix/v3.0.1`
2. Fix critical issue
3. Update CHANGELOG.md
4. Bump version to 3.0.1
5. Publish immediately
6. Merge to main

---

## 12. Success Metrics

### Code Quality

- [ ] 0 TypeScript errors
- [ ] 0 ESLint errors
- [ ] 80%+ test coverage
- [ ] All tests passing (unit + E2E)

### Performance

- [ ] Bundle size: <200KB (currently ~250KB)
- [ ] Extension activation: <2s
- [ ] API calls: <5s average

### Security

- [ ] 0 npm vulnerabilities
- [ ] API keys in Secrets API only
- [ ] No plaintext credentials in code

### User Experience

- [ ] Migration guide complete
- [ ] In-app migration prompt
- [ ] All commands functional
- [ ] No regressions from v2.x

### Documentation

- [ ] MIGRATION_GUIDE.md created
- [ ] CHANGELOG.md updated
- [ ] README.md updated
- [ ] ARCHITECTURE.md updated
- [ ] API_REFERENCE.md reviewed

---

## Appendix A: File-by-File TypeScript Changes

See detailed breakdown in subagent report (47 total changes across 15 files).

---

## Appendix B: Repository Pattern Diagrams

```
Old Architecture:
Commands → RedmineServer (direct)
Controllers → RedmineServer (direct)
Trees → RedmineServer (direct)

New Architecture:
Commands → IRepositoryFactory → RedmineRepositories → RedmineServer
Controllers → IIssueRepository → RedmineIssueRepository → RedmineServer
Trees → IRepositoryFactory → RedmineRepositories → RedmineServer

Testing:
Commands → MockRepositoryFactory → MockRepositories (no network)
```

---

## Appendix C: CI/CD Pipeline Diagram

```
GitHub Push
  ↓
Unit Tests (Vitest + vscode mock)
  ↓
Type Check (tsc --noEmit)
  ↓
Lint (ESLint)
  ↓
Start Docker Redmine
  ↓
E2E Tests (Real API calls)
  ↓
Coverage Report (Codecov)
  ↓
Publish (on tag push)
```

---

## Appendix D: Secret Key Format

```
Pattern: redmine:{workspaceUriHex}:{field}:v{version}

Example:
Workspace: file:///home/user/project1
Hex: 66696c653a2f2f2f686f6d652f757365722f70726f6a656374
Key: redmine:66696c653a2f2f2f686f6d652f757365722f70726f6a656374:apiKey:v1

Benefits:
- Unique per workspace
- Version for future migrations
- Machine-local (no sync)
```

---

## Implementation Checklist

### Pre-Implementation
- [ ] Backup current codebase
- [ ] Create branch `feature/v3-modernization`
- [ ] Set up project board

### Phase 0 ✓
- [ ] Fix esbuild.js bug
- [ ] Setup Vitest
- [ ] Remove lodash

### Phase 1 ✓
- [ ] Update dependencies
- [ ] Fix url.parse() migration
- [ ] Fix `any` types
- [ ] Update tsconfig.json

### Phase 2 ✓
- [ ] ESM tsconfig
- [ ] Rename esbuild.js → esbuild.cjs
- [ ] Update package.json
- [ ] Test activation

### Phase 3 ✓
- [ ] Create repository interfaces
- [ ] Implement Redmine repositories
- [ ] Create mock repositories
- [ ] Update commands
- [ ] Update controllers
- [ ] Update trees

### Phase 4 ✓
- [ ] Create SecretManager
- [ ] Create migration command
- [ ] Create set-API-key command
- [ ] Update parseConfiguration
- [ ] Update trees for async init

### Phase 5 ✓
- [ ] Remove activationEvents
- [ ] Replace ProgressLocation.Window
- [ ] Add resource cleanup

### Phase 6 ✓
- [ ] Write unit tests
- [ ] Write E2E tests
- [ ] Setup GitHub Actions

### Phase 7 ✓
- [ ] Create MIGRATION_GUIDE.md
- [ ] Update CHANGELOG.md
- [ ] Update README.md
- [ ] Update ARCHITECTURE.md
- [ ] Create GitHub release
- [ ] Publish to marketplace

---

## Timeline Summary

| Phase | Duration | Focus |
|-------|----------|-------|
| 0 | 2 days | Foundation fixes |
| 1 | 3 days | TypeScript 5.7 |
| 2 | 3 days | ESM migration |
| 3 | 5 days | Repository pattern |
| 4 | 3 days | Secrets API |
| 5 | 2 days | VS Code API modernization |
| 6 | 5 days | Testing & CI |
| 7 | 2 days | Documentation & release |
| **Total** | **25 days** | **~5 weeks** |

---

**End of Modernization Plan**

**Status**: Ready for implementation
**Next Step**: Begin Phase 0 - Foundation Fixes
