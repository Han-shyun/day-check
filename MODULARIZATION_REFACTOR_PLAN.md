# Day-Check Modularization and Restructure Draft

## 1. Background
- Current implementation is concentrated in two large files:
  - `server.js`: auth, security, holidays, state sync, DB migration, API routing
  - `src/main.js`: UI rendering, local state, events, calendar, sync, auth UI
- Requested collaboration scope:
  1. bucket sharing
  2. todo comments or additional records inside bucket
  3. clear visibility of `who wrote` and `when`

## 2. Feasibility With Current Single-File JS
### Conclusion
- Small feature additions are possible.
- Medium and long-term feature expansion is high-risk in the current single-file structure.

### Why It Becomes Hard
- Responsibility overload:
  - each file mixes multiple domains and layers
- Strong coupling:
  - auth, sync, state, UI, and business rules are tightly connected
- Testability issue:
  - isolated unit testing and predictable integration testing are hard
- Migration risk:
  - schema, API, and UI changes for collaboration are difficult to roll out safely

## 3. Additional Feature Expansion Assumption
- If future scope includes one or more of the following, refactor should be treated as mandatory:
  - mention and notifications
  - file attachments
  - advanced role-based visibility
  - activity feed filter and search
  - team or workspace model
  - external webhook or chat integration

## 4. Proposed Restructure
### 4.1 Backend
- Objective: split by domain and layer.

Proposed directory:

```txt
server/
  app.js
  index.js
  config/
    env.js
  db/
    client.js
    migration.js
  middleware/
    auth-session.js
    require-auth.js
    validate-csrf.js
    error-handler.js
  modules/
    auth/
      router.js
      service.js
      repository.js
    state/
      router.js
      service.js
      repository.js
    collab/
      router.js
      service.js
      repository.js
      policy.js
    holidays/
      router.js
      service.js
  shared/
    logger.js
    validators.js
    time.js
```

Key rules:
- `router`: HTTP request/response only
- `service`: business rules and transaction boundary
- `repository`: SQL and persistence only
- `policy`: role and permission checks in one place

### 4.2 Frontend
- Objective: separate rendering, state management, API access, and feature behavior.

Proposed directory:

```txt
src/
  app/
    bootstrap.js
    router.js
  core/
    store.js
    event-bus.js
    api-client.js
    date-utils.js
  features/
    auth/
      model.js
      api.js
      ui.js
    bucket/
      model.js
      api.js
      ui.js
    todo/
      model.js
      api.js
      ui.js
    collab/
      model.js
      api.js
      ui.js
    calendar/
      model.js
      api.js
      ui.js
  shared/
    components/
    constants/
```

Key rules:
- each feature owns its events and API calls
- shared store is the only write path for global state changes
- collaboration timeline UI is isolated from core todo render logic

## 5. Data Model Extension
- `collab_buckets`
  - shared bucket identity
- `collab_bucket_members`
  - `bucket_id`, `user_id`, `role` (owner/editor/viewer), `joined_at`
- `collab_todo_activities`
  - `todo_id`, `type` (comment/note/edit), `content`, `author_user_id`, `created_at`, `updated_at`
- `collab_invitations`
  - token, inviter, target user/email, expires_at, status
- `collab_audit_logs`
  - membership and permission change audit trail

Visibility mapping:
- `author`: author profile snapshot
- `timestamp`: `created_at` and optional `updated_at`
- policy: always display both fields in activity timeline

## 6. API Boundary Draft
- Bucket sharing:
  - `POST /api/collab/buckets/:bucketId/shares`
  - `POST /api/collab/invitations/:token/accept`
  - `GET /api/collab/buckets/:bucketId/members`
- Todo activity:
  - `GET /api/collab/todos/:todoId/activities`
  - `POST /api/collab/todos/:todoId/activities`
  - `PATCH /api/collab/activities/:activityId`
  - `DELETE /api/collab/activities/:activityId`

Policy:
- every write request must pass `membership + role` validation
- author metadata should remain immutable for audit consistency

## 6.1 Requested Collaboration Features (Detailed)
### Feature A: Bucket Sharing
- Objective:
  - allow one user to share bucket content with other users.
- Core flow:
  - owner creates invitation
  - target user accepts invitation
  - bucket member list is updated with role
- Share methods:
  - invite by account identifier
  - invite by one-time token link
- Membership states:
  - `pending`
  - `accepted`
  - `revoked`
  - `expired`
- Role model:
  - `owner`: invite, role change, revoke, content write
  - `editor`: content write and activity write
  - `viewer`: read only
- Required safeguards:
  - invitation expiration time
  - one-time token validation
  - owner-only role escalation
  - audit logging for invite, accept, revoke, role change

### Feature B: Comments and Additional Records on Todo
- Objective:
  - allow collaborative communication and context tracking inside each todo.
- Activity types:
  - `comment`: free-form comment
  - `note`: additional progress record
  - `system`: system generated event (status change, move, assign)
- Behavior:
  - append-only timeline by default
  - edit allowed within policy window or by owner
  - delete should be soft delete to preserve auditability
- Basic fields:
  - `activity_id`
  - `todo_id`
  - `type`
  - `content`
  - `author_user_id`
  - `created_at`
  - `updated_at`
  - `deleted_at` (soft delete)
- UX minimum:
  - timeline sorted by creation time
  - quick add comment input in todo detail panel
  - mention-ready payload shape for future extension

### Feature C: Visibility of Who and When
- Objective:
  - every collaborative activity must clearly show author and time.
- Mandatory display fields:
  - author display name
  - author avatar (if available)
  - created timestamp
  - edited marker and edited timestamp when applicable
- Time policy:
  - store in UTC on server
  - render in user local timezone in client
  - keep ISO source for debugging/export
- Consistency rule:
  - no activity item can be rendered without `author + timestamp`.

## 6.2 Permission Matrix (Operational)
- `owner` can:
  - create/revoke invitations
  - change member roles
  - write and moderate activities
  - edit bucket settings
- `editor` can:
  - read shared bucket
  - write todo activities
  - edit todo content within assigned scope
- `viewer` can:
  - read bucket and activity timeline only
- Blocked operations:
  - viewer write attempt must return `403`
  - editor owner-escalation attempt must return `403`
  - non-member access must return `404` or `403` by security policy

## 6.3 Acceptance Criteria for Requested Features
- Bucket sharing:
  - invitation can be created and accepted successfully
  - accepted user sees shared bucket content
  - revoked or expired invitation cannot be reused
- Todo activities:
  - editor and owner can create activity on todo
  - viewer cannot create, edit, delete activity
  - timeline preserves order and shows soft-deleted marker when needed
- Visibility:
  - every activity row displays author and timestamp
  - edited activity shows both original creation time and last edit time
  - list and detail views use same visibility rule

## 7. Migration Strategy
### Phase 0: Contracts First
- define collaboration API and schema contract
- define coding convention and module ownership

### Phase 1: Structural Extraction (No Behavior Change)
- extract backend auth, state, and holidays modules
- split `src/main.js` into core and feature modules without UX change

### Phase 2: Collaboration Foundation
- add member and invitation tables and flows
- add permission policy and audit events

### Phase 3: Activities and Visibility
- add todo activity APIs and timeline UI
- expose `author + timestamp` in all activity records

### Phase 4: Hardening
- add module tests (policy, service, route integration)
- add observability (error rate, permission denied, p95 latency)

## 8. Decision
- The requested three features can be implemented in current structure.
- For maintainability and future feature growth, restructure should start before full collaboration rollout.
- Recommended practical route:
  1. run Phase 1 extraction
  2. run Phase 2 foundation
  3. ship collaboration features incrementally
