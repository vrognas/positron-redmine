# Implementation Plan - Phase 2

**Date**: 2025-11-25
**Status**: Planning
**Previous**: Phase 1 complete (MVP-1 through MVP-4, v3.6.0)

---

## Problem Statement

**User**: Data programmer/consultant working in Positron (Code-OSS fork)

**Core workflow needs**:
1. Log time to correct issues (billable vs non-billable) for invoicing
2. Track work across multiple projects/clients simultaneously
3. Assess timelines: due dates, sub-tasks, how others' work affects mine
4. Minimize context switching to browser

**Current fit score**: ~60%

---

## Gap Analysis

### Bugs

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| B1 | Subproject filter logic inverted | Issues duplicated in tree view | 5 min |

### Missing Features

| # | Feature | Impact | Effort |
|---|---------|--------|--------|
| F1 | Billable indicator (tracker visibility) | Can't distinguish Task vs Non-billable at glance | Low |
| F2 | Sub-issue hierarchy | Can't see task breakdown or roll-up | Medium |
| F3 | Issue relations (blocks/blocked by) | Can't see dependencies | Medium |
| F4 | Gantt/timeline visualization | No visual planning | High |

### UX Inconsistencies

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| U1 | Time logging UX differs (IssueController vs QuickLogTime) | Friction, learning curve | Low |

---

## What We Won't Build (Scope Boundaries)

- **No custom fields support** - tracker covers billable distinction
- **No issue creation in IDE** - browser adequate, rarely used
- **No attachment handling** - browser adequate
- **No journal/comment viewing** - nice-to-have, not blocking
- **No drag-to-reschedule in Gantt** - read-only sufficient initially
- **No saved queries** - Redmine web handles complex filtering

---

## Phased Implementation

### Phase 2.0: Bug Fixes (P0)

**Scope**: Fix blocking bugs before new features

| Task | File | Change |
|------|------|--------|
| B1: Fix subproject filter | `redmine-server.ts:525-527` | Swap ternary condition |

**Effort**: 15 min (including test)

---

### Phase 2.1: Billable Visibility (P1)

**Scope**: Show tracker (Task vs Non-billable) in issue display

**Option selected**: Tooltip + subtle description prefix

**Changes**:
1. `tree-item-factory.ts`: Add tracker to tooltip
2. `tree-item-factory.ts`: Optional `$` prefix for Task tracker in description

**Display**:
```
Current:  Fix login bug #123 10/40h 5d On Track
Proposed: Fix login bug #123 10/40h 5d On Track [Task]
          or just in tooltip
```

**Effort**: 30 min

**Decision needed**: Inline indicator vs tooltip-only?

---

### Phase 2.2: Sub-Issue Support (P0)

**Scope**: Display parent/child issue relationships

**API available**:
```
GET /issues/:id.json?include=children  → child issues
GET /issues.json?parent_id=123         → filter by parent
Issue response includes: parent: { id, name }
```

**Changes**:

1. **Model** (`issue.ts`):
   ```typescript
   parent?: NamedEntity;
   children?: Issue[];
   ```

2. **API** (`redmine-server.ts`):
   - Modify `getIssuesAssignedToMe()` to group by parent
   - Or: fetch with `include=children` for parent issues

3. **Tree** (`my-issues-tree.ts`):
   - Make parent issues collapsible
   - Show children nested under parent
   - Aggregate hours in parent tooltip

**Display**:
```
▶ Parent Task #100 (3 sub-issues)
  ├─ Sub-task A #101 2/8h
  ├─ Sub-task B #102 4/8h
  └─ Sub-task C #103 0/4h
```

**Effort**: 3-4h

**Questions**:
1. Show only top-level in tree, expand for children? Or flat with indent?
2. If assigned to child but not parent, show parent anyway?

---

### Phase 2.3: Issue Relations (P1)

**Scope**: Show blocking dependencies

**API available**:
```
GET /issues/:id.json?include=relations
Relation types: blocks, blocked, precedes, follows, relates, duplicates
```

**Changes**:

1. **Model** (`issue.ts`):
   ```typescript
   relations?: IssueRelation[];

   interface IssueRelation {
     id: number;
     issue_id: number;
     issue_to_id: number;
     relation_type: 'blocks' | 'blocked' | 'precedes' | 'follows' | ...;
     delay?: number;
   }
   ```

2. **API** (`redmine-server.ts`):
   - Add `include=relations` to issue fetches
   - Or separate `getIssueRelations(issueId)` method

3. **Tree** (`my-issues-tree.ts`):
   - Add relation info to tooltip
   - Optional: icon badge for blocked issues

**Display (tooltip)**:
```markdown
**#123: Fix login bug**
**Blocked by:** #120 (Database migration)
**Blocks:** #125, #126
**Progress:** 10h / 40h
```

**Effort**: 2-3h

**Questions**:
1. Show relations in tooltip only, or also in tree description?
2. Fetch relations eagerly (more API calls) or on-demand (hover)?

---

### Phase 2.4: Unified Time Logging UX (P1)

**Scope**: Make IssueController use same flow as QuickLogTime

**Current IssueController flow** (`issue-controller.ts:38-70`):
```
1. Pick activity
2. Enter "hours|comment" in single field  ← awkward
```

**QuickLogTime flow** (`quick-log-time.ts`):
```
1. Pick issue (skip - already have it)
2. Pick activity
3. Enter hours (flexible: "2.5", "1:45", "1h 30min")
4. Enter comment (optional, separate)
```

**Changes**:
1. Extract time input logic from `quick-log-time.ts` to shared utility
2. Replace `setTimeEntryMessage()` in IssueController
3. Reuse `parseTimeInput()` for flexible formats

**Effort**: 1-2h

---

### Phase 2.5: Gantt Webview (P2 - Future)

**Scope**: Visual timeline for issues and dependencies

**Deferred** - evaluate after 2.1-2.4 complete

**Considerations**:
- VS Code webview complexity (CSP, state, messaging)
- Visualization library (D3.js vs custom SVG vs vis-timeline)
- Read-only initially (no drag-to-edit)
- May not be needed if tree view with relations is sufficient

**Effort**: 8-12h (if pursued)

---

## Implementation Order

```
2.0 Bug Fixes     [15 min]  ← Do first, unblocks tree view
    ↓
2.1 Billable      [30 min]  ← Quick win, high value for invoicing
    ↓
2.2 Sub-issues    [3-4h]    ← Core feature for task breakdown
    ↓
2.3 Relations     [2-3h]    ← Dependencies, builds on 2.2
    ↓
2.4 Time UX       [1-2h]    ← Polish, can parallelize
    ↓
2.5 Gantt         [8-12h]   ← Evaluate need after above
```

**Total P0-P1**: ~8-10h
**With P2 (Gantt)**: ~18-22h

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Problem-solution fit | 60% | 85%+ |
| Browser visits/day | 4-5 | 1-2 |
| Time to log entry | 15s | 10s |
| Can see task breakdown | No | Yes |
| Can see blockers | No | Yes |

---

## Open Questions

1. **Billable display**: Inline `[Task]` suffix, `$` prefix, or tooltip-only?
2. **Sub-issue tree**: Flat with indent vs collapsible parent nodes?
3. **Unassigned parents**: Show parent if only assigned to child?
4. **Relations fetch**: Eager (all at once) vs lazy (on hover)?
5. **Gantt necessity**: Re-evaluate after 2.2-2.3 - may be overkill?

---

## Changelog

- 2025-11-25: Initial plan created from fit assessment
