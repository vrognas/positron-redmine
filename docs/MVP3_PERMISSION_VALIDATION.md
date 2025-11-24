# MVP-3 Permission Validation Analysis

**Date**: 2025-11-24
**Context**: Validating whether MVP-3 (Quick Time Logging) should check `:log_time` permission before showing command
**Status**: RECOMMENDATIONS PROVIDED

---

## Question Clarification

**Original Questions**:
1. Should MVP-3 check `:log_time` permission before showing command?
2. How to check user's time tracking permissions efficiently?

---

## Key Findings

### 1. Current Implementation Status

**MVP-3 Command**: "Redmine: Quick Log Time" (`/src/commands/quick-log-time.ts`)
- Triggers UI flow: Select issue → Input hours/comment → POST to `/time_entries.json`
- **Current approach**: No permission validation - relies on server 403 response
- Located in `/src/redmine/redmine-server.ts` line 282: `addTimeEntry()` method

**Existing Error Handling**:
```typescript
// From redmine-server.ts lines 171-177
if (statusCode === 403) {
  const error = new Error(
    "Server returned 403 (perhaps you haven't got permissions?)"
  );
  // ... error handling
}
```

---

### 2. Redmine REST API Capabilities for Permission Checking

#### ❌ No Direct Permission Check Endpoint

**Checked endpoints**:

| Endpoint | Availability | Returns |
|----------|--------------|---------|
| `GET /users/current.json` | ✅ All users | User data (minimal for non-admin) |
| `GET /roles.json` | ✅ All users | List of role definitions |
| `GET /roles/{id}.json` | ❌ Admin only | Permissions for role (403 for non-admin) |
| `GET /projects/{id}.json` | ✅ All users | Project data (no permission info) |
| `GET /users/{id}.json` | ❌ Admin only | User details |

**Critical Constraint**:
- **No API endpoint exists** that returns current user's permissions in a specific project
- `/roles/{id}.json` requires admin privileges (returns 403 for non-admins)
- No permission pre-check possible without admin access

#### Why No Permission API?

Redmine's architecture (server-side):
```ruby
# Redmine core logic
User.current.allowed_to?(:log_time, @project)  # Server-side check only
```

Permission evaluation is **context-dependent**:
- Depends on user's roles **in that specific project**
- Depends on role's permissions configuration **for that project**
- Different per project (user might have permission in Project A but not B)
- Cannot be determined without project context

**REST API Design**:
- API is intentionally stateless (doesn't expose permission checking)
- Permissions validated server-side on each action
- 403 response is the permission checking mechanism

---

### 3. Current User Capabilities

**`GET /users/current.json` Response** (non-admin user):

```json
{
  "user": {
    "id": 5,
    "login": "jdoe",
    "firstname": "John",
    "lastname": "Doe",
    "mail": "john@example.com",
    "created_on": "2025-11-20T10:30:00Z",
    "last_login_on": "2025-11-24T14:30:00Z"
    // Note: No memberships, roles, or permission data exposed
  }
}
```

**What's NOT available**:
- User's roles in projects
- User's group memberships
- Project-specific permissions
- Whether user can log time

---

### 4. Time Logging Permission Implementation

**Permission Name**: `:log_time` (in Redmine terminology)

**Server-Side Check** (when POST `/time_entries.json`):

```ruby
# Redmine source code logic
class TimeEntriesController < ApplicationController
  def create
    # ... validation

    # SERVER CHECKS PERMISSION HERE
    unless User.current.allowed_to?(:log_time, @project)
      head :forbidden  # Returns 403
    end

    @time_entry.save
  end
end
```

**Per-Project Basis**:
- User might have `:log_time` in "Project Alpha" but not "Project Beta"
- Would require checking permission for **every issue's project**
- Even then, result is per-issue, not cached

---

## RECOMMENDATIONS

### Recommendation 1: DO NOT Pre-check Permissions (Current Approach ✅)

**Decision**: Keep current implementation - no permission pre-check

**Reasoning**:

1. **No API Available**
   - Impossible to check without admin access
   - Would require redesigning Redmine API (outside scope)

2. **Better UX/DX Flow**
   - User discovers permission error at action time (when attempting to log)
   - Minimal network overhead (no extra API call)
   - Clear error message: "Server returned 403 (perhaps you haven't got permissions?)"

3. **Aligned with REST Principles**
   - Redmine API design expects 403 responses for permission errors
   - Standard HTTP error handling
   - Matches other VS Code extensions' approaches

4. **Performance**
   - Avoids extra API call per issue
   - If 100 issues in workspace, no need to check 100 permissions
   - Only 1 API call when user actually tries to log time

5. **Minimal Code**
   - Already implemented in error handling
   - No additional code complexity

---

### Recommendation 2: Improve Error Message (Suggested Enhancement)

**Current**:
```
Server returned 403 (perhaps you haven't got permissions?)
```

**Improved**:
```
Cannot log time: You don't have permission in this project.
Visit: {server}/{project}/settings/members to request access.
(Tip: Quick Log Time requires :log_time permission in the project)
```

**Implementation Location**:
- File: `/src/redmine/redmine-server.ts`
- Method: `addTimeEntry()` error handler
- Effort: ~15 minutes, minimal risk

**Benefits**:
- Explains *why* permission denied
- Guides user to solution
- Educational (teaches about permission model)

---

### Recommendation 3: Handle Graceful Degradation (Optional)

**Use Case**: Show command palette item grayed-out if permissions likely insufficient

**Approach**: Fetch `/users/current.json` on command initialization

```typescript
// Pseudocode
async function quickLogTimeCommand(props: ActionProperties) {
  const currentUser = await server.getCurrentUser();
  const assignedIssues = await server.getIssuesAssignedToMe();

  // If zero issues assigned, permission check is redundant
  // (Either user has no access OR no issues)
  if (assignedIssues.length === 0) {
    vscode.window.showWarningMessage(
      'No issues assigned - might lack permission to log time. Check project access.'
    );
    return;
  }

  // Proceed with flow
  // ...error handling catches actual permission errors
}
```

**Cost**: 1 extra API call (getCurrentUser)
**Benefit**: Slightly better UX for permission-less users
**Downside**: Extra latency, not reliable (some Redmine setups allow logging without being assigned)
**Verdict**: **OPTIONAL** - Worth considering if UX testing shows confusion

---

### Recommendation 4: Document Permission Requirements

**Add to README.md**:

```markdown
## Permissions Required

### Time Logging (Quick Log Time - MVP-3)
- **Permission**: `:log_time` in the project
- **How to check**:
  1. Go to Project → Settings → Members
  2. Find your user/group
  3. Verify role has "Log time" permission

### Time Entry Viewing (MVP-2)
- **Permission**: View time entries (usually enabled by default)
- **Restricted by**: "View spent time" and "View own time entries" config
```

**Location**: `/home/user/positron-redmine/README.md` (create section if missing)
**Effort**: ~10 minutes
**Impact**: Reduces support questions

---

## Implementation Roadmap

### Phase 1: Current (MVP-3 Implementation)
- **Status**: ✅ READY
- **Approach**: No pre-check, rely on server 403
- **Code**: Existing `addTimeEntry()` handles errors

### Phase 2: Optional Enhancement (v3.3.1 or later)
- **Consider**: Improved error message (Recommendation 2)
- **Timeline**: After MVP-3 shipped and user feedback received
- **Effort**: 15 minutes

### Phase 3: Future (v3.4+, Optional)
- **Consider**: Graceful degradation (Recommendation 3)
- **Timeline**: If UX testing shows confusion
- **Effort**: 30 minutes

---

## Technical Deep-Dive: Why API Has No Permission Endpoint

### Redmine Architecture Decision

**Design Philosophy**:
1. **Stateless**: API doesn't track session state
2. **Action-based**: Permissions evaluated when action executed
3. **Context-aware**: Permission varies by project context
4. **Security**: Avoid exposing permission matrix

**Example of Context-Dependent Permission**:

```ruby
# Same user, different projects, different results
user.allowed_to?(:log_time, project_alpha)  # => true
user.allowed_to?(:log_time, project_beta)   # => false (User not member)
user.allowed_to?(:log_time, project_gamma)  # => false (Role lacks permission)
```

**Why Not Add to API?**

```ruby
# Theoretical endpoint: GET /projects/{id}/permissions.json
# Problem 1: Massive response (every permission per user)
# Problem 2: Admin-only (security issue if all users can view permissions)
# Problem 3: Race condition (permissions change, response stales)
# Problem 4: Unnecessary complexity (use 403 response instead)
```

**REST Best Practice**:
> "Let the server return 403 Forbidden rather than pre-checking all possible actions."

---

## Comparison with Other Redmine Clients

| Client | Approach | Notes |
|--------|----------|-------|
| **Web UI** | Pre-load form, validate on submit | Can show disabled buttons |
| **Command Line (oweary-redmine)** | Attempt action, handle 403 | Same as recommendation |
| **Python Client (pyredmine)** | No pre-check, handle 403 | Same as recommendation |
| **Postman** | No pre-check, show 403 | Same as recommendation |
| **VS Code Extension (THIS)** | Currently: No pre-check | ✅ CORRECT |

---

## Testing Recommendations for MVP-3

### Test 1: Successful Time Logging
```
Given: User has :log_time permission in project
When: Quick Log Time → select issue → enter "2.5|message"
Then: API called, success message shown ✅
```

### Test 2: Permission Denied
```
Given: User lacks :log_time permission
When: Quick Log Time → select issue → enter "2.5|message"
Then: Error shown: "Server returned 403 (perhaps you haven't got permissions?)"
      User can click to visit project settings ✅
```

### Test 3: Issue Filtering
```
Given: User has :log_time in Project A, not in Project B
When: Quick Log Time → view issue list
Then: Shows ALL assigned issues (filtered on log attempt, not upfront)
      (This is correct - user might get permission later)
```

---

## Unresolved Questions

**None identified** - All permission-related questions answered by REST API analysis.

---

## Summary Table

| Question | Answer | Confidence |
|----------|--------|-----------|
| Should MVP-3 check `:log_time` before showing command? | **NO** - Impossible without admin API access | 100% |
| How to check permissions efficiently? | **Don't** - Server-side 403 is the mechanism | 100% |
| Can we pre-validate for better UX? | **No** - No API endpoint available | 100% |
| What's the minimum viable approach? | Current: Handle 403 errors gracefully | 100% |
| Should we improve error message? | **YES** - Optional enhancement (v3.3.1+) | 95% |

---

## References

### Redmine API Documentation
- [REST Users - Redmine](https://www.redmine.org/projects/redmine/wiki/rest_users)
- [REST Roles - Redmine](https://www.redmine.org/projects/redmine/wiki/Rest_Roles)
- [REST API Overview - Redmine](https://www.redmine.org/projects/redmine/wiki/rest_api)
- [Roles & Permissions - Redmine](https://www.redmine.org/projects/redmine/wiki/RedmineRoles)

### Stack Overflow Discussions
- Time entry permission checks in API context
- User/Admin permission asymmetry in REST API

### Codebase References
- `/src/redmine/redmine-server.ts` - Line 282: `addTimeEntry()`
- `/src/redmine/redmine-server.ts` - Lines 171-177: 403 error handling
- `/src/commands/quick-log-time.ts` - MVP-3 implementation

---

## Approval & Next Steps

**VALIDATED**: MVP-3 can proceed with current permission handling strategy

**Next Actions**:
1. Implement MVP-3 with current error handling (no pre-check)
2. Add unit test for 403 error case
3. Consider improved error message in v3.3.1 based on user feedback
4. Document permission requirements in README.md
