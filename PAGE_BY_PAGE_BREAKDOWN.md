# Sampson HQ — Page-by-Page Feature Breakdown

> **Hybrid architecture**: Accelo is the source of truth for business data. Supabase serves as
> the read layer, computed analytics store, and app-specific state. Writes go to Accelo first,
> then sync to Supabase. Background jobs (Vercel Cron) keep the DB in sync.
> See also: `UI_VS_ACCELO_DATA_MODEL.md` for the type-level mapping.

---

## Table of Contents

1. [Shared Bootstrap (Cached)](#1-shared-bootstrap-cached)
2. [Manager Dashboard](#2-manager-dashboard)
3. [Tasks Page](#3-tasks-page)
4. [Worker View](#4-worker-view)
5. [Focus / Timer Session](#5-focus--timer-session)
6. [Clients Page](#6-clients-page)
7. [Cross-Page API Budget](#7-cross-page-api-budget)
8. [Gap Resolutions](#8-gap-resolutions)
9. [Accelo Status Mapping](#9-accelo-status-mapping)
10. [Hybrid Architecture: Supabase Layer](#10-hybrid-architecture-supabase-layer)
11. [Supabase Schema](#11-supabase-schema)
12. [Sync & Cron Strategy](#12-sync--cron-strategy)
13. [Auth & Access Control](#13-auth--access-control)

---

## 1. Shared Bootstrap (Cached)

These calls fire once per session and are reused across all pages. Cache for the session duration (or 1 hour for rarely-changing data).

| # | Data | Endpoint | Fields | Used By |
|---|------|----------|--------|---------|
| B1 | Active staff list | `GET /staff?_filters=standing(active)&_fields=id,firstname,surname,title,email,position,rate(id,charged)&_limit=100` | id, name, title, rate | All pages |
| B2 | Active companies | `GET /companies?_filters=standing(active)&_fields=id,name&_limit=100` | id, name | Tasks, Clients, Worker |
| B3 | Task statuses | `GET /tasks/statuses?_fields=id,title,standing&_limit=50` | id, title, standing | Tasks, Worker, Focus |
| B4 | Task priorities | `GET /tasks/priorities?_fields=id,title&_limit=20` | id, title | Tasks, Worker |
| B5 | Task types (categories) | `GET /tasks/types?_fields=id,title&_limit=50` | id, title | Tasks, Worker, Dashboard |
| B6 | Billing rates | `GET /rates?_fields=id,title,charged&_limit=100` | id, title, charged | Dashboard (capacity) |
| B7 | Job→Company map | `GET /jobs?_fields=id,company(id,name)&_limit=100` (paginated) | id, company.name | All pages (task→client resolution) |

**Total: 7 calls** — all parallelizable, all cacheable.

---

## 2. Manager Dashboard

**Route:** `/(app)/page.tsx`
**Role:** Manager
**Purpose:** Real-time operational snapshot — active work, team capacity, time logged today, and per-task stage history for triage and prioritization.

### Features

| # | Feature | Description | Accelo API Call(s) | Notes |
|---|---------|-------------|-------------------|-------|
| 1 | **Task feed (queue)** | All active tasks sorted by priority/due date. Shows title, client, stage badge, assignee, priority | `GET /tasks?_filters=standing(active)&_fields=id,title,against_type,against_id,date_due,task_status(id,title,standing),task_priority(id,title),assignee(id,firstname,surname),manager(id,firstname,surname),billable,nonbillable,budgeted,logged,remaining,date_created,date_started,date_modified,task_type(id,title)&_limit=100` | Paginate if >100 tasks. `task_status.title` maps to stage labels |
| 1a | **Resolve client name** | Tasks link via `against_type`/`against_id` (typically jobs). Must resolve to company name | `GET /jobs?_filters=id({job_ids})&_fields=id,title,company(id,name)&_limit=100` | Batch all unique job IDs from tasks into one call. Uses cached B7 data |
| 2 | **Today: completed tasks** | Tasks completed today with deliverable, client, hours | `GET /tasks?_filters=standing(complete),date_completed_after({today_start}),date_completed_before({today_end})&_fields=id,title,against_id,logged,task_type(title),assignee(firstname),date_completed&_limit=100` | Filter by today's date range |
| 3 | **Today: hours logged per task** | Tasks with time logged today but not completed. Stacked progress bar showing previous vs today's delta | `GET /activities?_filters=date_created_after({today_start}),date_created_before({today_end})&_fields=id,task(id),billable,nonbillable,staff(id,firstname),date_created&_limit=100` | Sum billable+nonbillable per task → `hoursLoggedToday`. Join with task list from #1 |
| 4 | **Stage badge + dwell time** | Current stage and how long task has been in that stage (e.g., "Waiting on Client · 6d") | Derived from task `date_modified` or activity history | **GAP:** Accelo only stores current status, not transition timestamps. Dwell time = `now - date_modified` (lossy proxy) or reconstruct from activity log (expensive) |
| 5 | **Stage history / audit trail** | Expanded: vertical timeline of all stage transitions with date, who, notes | `GET /activities?_filters=against_type(tasks),against_id({task_id})&_fields=id,subject,body,date_created,staff(id,firstname,surname),medium&_limit=100&order_by_asc(date_created)` | **On-demand** (per expanded task). Parse activities for status-change events |
| 6 | **Dependencies / blocking items** | What documents or info are blocking a task | **No direct API.** Workarounds: (A) Parse activity bodies for request-type entries. (B) Use Issues linked to tasks. (C) Custom profile fields | **HIGH GAP.** Recommend: use Issues linked against tasks (`against_type=tasks`) with issue `standing` tracking resolution |
| 7 | **Per-task notes** | Internal notes with author and date | `GET /activities?_filters=against_type(tasks),against_id({task_id}),medium(note)&_fields=id,body,date_created,staff(id,firstname,surname)&_limit=50` | **On-demand.** Filter by `medium=note` |
| 8 | **Bounce count** | How many times a task bounced back to a previous stage | Derived from activity history (#5) | Client-side: count revisits to previously-seen statuses |
| 9 | **Hours logged vs estimated** | "3h of 8h estimated" with color coding | From task data in #1 | `logged/3600` vs `budgeted/3600`. Red >= 100%, amber >= 80% |
| 10 | **Due date severity** | "Due in 3d", "Due today", "2d overdue" badges | From task `date_due` in #1 | Pure client-side computation |
| 11 | **Assigned by / assigned at** | "Assigned to Gio by Mitch · Jan 15" | `manager` field on task + `date_created` | `manager` = proxy for "assigned by". For true semantics, parse earliest activity |
| 12 | **Team capacity card** | Per-staff bar showing load percentage | `GET /staff` (B1) + task data from #1 | Group tasks by `assignee.id`, sum `budgeted` or `remaining` per person |
| 12a | **Non-billable hours this week** | Breakdown of internal/admin time per staff | `GET /activities?_filters=date_created_after({week_start}),date_created_before({week_end}),nonbillable_greater_than(0)&_fields=id,nonbillable,staff(id),subject&_limit=100` | Sum `nonbillable` per staff. Parse `subject` to categorize |
| 12b | **Billing rate per staff** | Revenue computation | From B6 (rates) + B1 (staff) | **GAP:** `costRate` (internal salary) is NOT in Accelo. Must be app config |
| 12c | **PTO hours** | PTO for the week per staff | **No API.** | **GAP.** Workaround: log PTO as non-billable activities with "PTO" subject convention |
| 13 | **Time log feed** | Chronological list of all time entries today with member, client, description, duration, billable indicator | `GET /activities?_filters=date_created_after({today_start}),date_created_before({today_end})&_fields=id,subject,body,billable,nonbillable,staff(id,firstname,surname),against_type,against_id,date_created,rate_charged&_limit=100&order_by_desc(date_created)` | Join `against_id` with companies/jobs. Duration = `(billable+nonbillable)/3600` |

### Data Flow

1. **Page load** — 3-4 parallel calls: active tasks, today's activities, week's non-billable activities, + job/company resolution from cache
2. **Client-side** — group tasks by assignee (capacity), compute dwell times, bounce counts, severity
3. **On-demand** — expand a task → fetch activities for stage history + notes (1-2 calls)

### API Call Budget

| Scenario | Calls |
|----------|-------|
| Page load (no expansion) | 4-6 |
| Expand one task | +1 to +2 |
| Full page + 3 tasks expanded | 7-12 |

---

## 3. Tasks Page

**Route:** `/(app)/tasks/page.tsx`
**Role:** Manager
**Purpose:** Full task table — the primary operational command center for filtering, sorting, bulk operations, escalation, and task creation.

### Features

| # | Feature | Description | Accelo API Call(s) | Notes |
|---|---------|-------------|-------------------|-------|
| 1 | **Task table** | Sortable table: title, client, assignee, status, priority, due, hours | `GET /tasks?_filters=standing_not(cancelled)&_fields=id,title,description,against_type,against_id,date_due,date_created,date_modified,task_status(id,title,standing),task_priority(id,title),assignee(id,firstname,surname),manager(id,firstname,surname),billable,nonbillable,budgeted,logged,remaining,rate_charged,task_type(id,title),custom_id&_limit=100` | Paginate for >100 tasks |
| 1a | **Resolve client names** | Task → job → company name | Cached B7 data or `GET /jobs?_filters=id({ids})&_fields=id,company(id,name)` | Batch job IDs into single call |
| 2 | **Status tabs with counts** | All Tasks (22), To Do (8), In Progress (5), In Review (3), Done (6) | Derived from #1 | Map `task_status.title` to UI states. Counts computed client-side |
| 3 | **Sort by column** | Click headers to sort by any column | Client-side sorting | No additional API calls |
| 4 | **Filter by status** | Tab selection filters table | Client-side OR `_filters=status_id({id})` | Client-side simpler if all tasks loaded |
| 5 | **Filter by assignee** | Staff dropdown | Client-side filter | Staff list from B1 |
| 6 | **Filter by client** | Client dropdown | Client-side filter | Company list from B2 |
| 7 | **Filter by priority** | Priority dropdown | Client-side filter | Priority list from B4 |
| 8 | **Search by title** | Text search across tasks | Client-side OR `_search={query}` | |
| 9 | **Filter by flagged** | Show only escalated tasks | **GAP.** No native flag field | Workaround: custom profile field (boolean) → `_filters=profile_field_id({id},true)` |
| 10 | **Inline status change** | Click status badge → dropdown → update | `PUT /tasks/{task_id}` with `{ "status_id": {id} }` | **WRITE.** Use optimistic UI update |
| 11 | **Inline priority change** | Click priority badge → dropdown → update | `PUT /tasks/{task_id}` with `{ "priority_id": {id} }` | **WRITE** |
| 12 | **Inline assignee change** | Click assignee → dropdown → reassign | `PUT /tasks/{task_id}` with `{ "assignee_id": {id} }` | **WRITE** |
| 13 | **Mark task done** | Hover action: checkmark | `PUT /tasks/{task_id}` with `{ "status_id": {done_id} }` | **WRITE** |
| 14 | **Delete task** | Hover action: trash | `PUT /tasks/{task_id}` (set `standing=cancelled`) | Prefer soft-delete for audit trail |
| 15 | **Flag / escalate task** | Dialog: 4 reasons + optional note | `POST /activities` (log escalation note) + optionally `PUT /tasks/{id}/profiles/fields/{flag_field_id}` | **GAP** requires custom profile field. Activity records the escalation for audit |
| 16 | **Request info from client** | Dialog: contact method + note. Marks task as waiting | `PUT /tasks/{id}` (status → waiting) + `POST /activities` (note with request details) | 2 API calls |
| 17 | **Bulk select + reassign** | Checkbox selection → reassign all to one staff | `PUT /tasks/{id}` × N tasks | No batch endpoint. Loop with throttle. 50 tasks = 50 calls (1% of hourly budget) |
| 18 | **Create new task** | Dialog: title, client, assignee, category, due date, priority, estimated hours | `POST /tasks` with `{ "title", "against_type", "against_id", "assignee_id", "type_id", "date_due", "priority_id", "budgeted": hours*3600 }` | `client` → resolve to `job_id` first (or create against `company`). `category` → `type_id` |
| 18a | **Resolve client → against_id** | When creating task: client → job lookup | `GET /jobs?_filters=company_id({id}),standing(active)&_fields=id,title` | If multiple jobs, user picks one |
| 19 | **Task detail slide-out** | Expand row → history, notes, documents | Activities fetch (same pattern as Dashboard #5, #7) | On-demand per task |
| 20 | **Document association** | Expanded row shows client documents | `GET /activities?_filters=against_type(companies),against_id({company_id}),has_attachment(1)&_fields=id,subject,date_created,staff(firstname)&_limit=100` | **GAP:** Accelo has no document library. Files are on activities |
| 21 | **Staff queue sheet** | Slide-out: one staff member's open tasks grouped by priority | Derived from task data in #1 | Client-side filter + group. No additional API call |
| 22 | **Recurring task indicator** | Badge on recurring tasks | **GAP.** No native `recurring` field | Workaround: custom profile field or infer from parent contract |

### Data Flow

1. **Page load** — Tasks (paginated) + job→company resolution = 2-4 calls
2. **All filtering/sorting/search** — client-side on loaded data
3. **Write operations** — 1-2 calls per action (optimistic UI)
4. **On-demand** — expand row loads activities for that task's history/docs

### API Call Budget

| Scenario | Calls |
|----------|-------|
| Page load | 2-4 (+ bootstrap cache) |
| Inline edit (status/priority/assignee) | 1 |
| Escalate / request info | 1-2 |
| Create task | 1-2 |
| Bulk reassign (10 tasks) | 10 |

---

## 4. Worker View

**Route:** `/worker/page.tsx`
**Role:** Worker
**Purpose:** Personal task board — my queue, timer, per-account task management, quick actions.

### Features

| # | Feature | Description | Accelo API Call(s) | Notes |
|---|---------|-------------|-------------------|-------|
| 1 | **Worker selector** | Dropdown of all staff | Cached B1 | |
| 2 | **My Queue** | Open tasks assigned to selected worker, sorted by priority + due date | `GET /tasks?_filters=assignee({staff_id}),standing_not(complete)&_fields=id,title,against_type,against_id,date_due,task_status,task_priority,logged,budgeted,remaining,rate_charged&_limit=100` | Core data call |
| 3 | **Task card — client name** | Company name for each task | Resolve via cached B7 (job→company map) | If `against_type=company`, use directly |
| 4 | **Task card — category badge** | Service category (Bookkeeping, Payroll, etc.) | **GAP.** No native category on tasks | Use parent job type or custom field |
| 5 | **Task card — priority/due/hours** | Visual indicators | From task data in #2 | All seconds → hours conversion client-side |
| 6 | **Start timer** | Begin tracking time on a task | **No API call.** localStorage via `timer-store.ts` | Accelo not hit until timer stopped |
| 7 | **Stop timer / log time** | Stop timer, create activity | `POST /activities` with `{ against_type: "tasks", against_id: {id}, billable: {seconds}, owner_id: {staff_id}, medium: "note", visibility: "all" }` | **WRITE.** Core time-logging operation |
| 8 | **Mark complete** | Complete task + log time | `POST /activities` (log time) + `PUT /tasks/{id}` (status → complete) | 2 calls |
| 9 | **Request info** | Mark waiting on client | `PUT /tasks/{id}` (status → waiting) + `POST /activities` (note) | 2 calls |
| 10 | **Waiting on Client section** | Tasks flagged as blocked | `GET /tasks?_filters=assignee({staff_id}),standing(paused)&_fields=id,title,against_id,date_due` | Or filter by specific status ID for "waiting" |
| 11 | **My Accounts** | Clients assigned to this worker with open task count | Derived from #2 | Deduplicate companies from task list. No "assigned staff" field on companies |
| 12 | **Per-account task rows** | Tasks grouped by client | Subset of #2 data, grouped client-side | No additional call |
| 13 | **Per-account — reassign** | Reassign a task | `PUT /tasks/{id}` with `{ assignee_id: {id} }` | **WRITE** |
| 14 | **Per-account — change status/priority** | Quick edit dropdowns | `PUT /tasks/{id}` | **WRITE** |
| 15 | **Per-account — documents** | Client documents | `GET /resources?_filters=against_type(companies),against_id({company_id})&_fields=id,title&_limit=100` | Lazy-load on expand. Limited metadata |
| 16 | **Per-account — task history** | Expanded task timeline | `GET /activities?_filters=against_type(tasks),against_id({task_id})&_fields=id,subject,body,date_created,staff&_limit=50` | On-demand per task |
| 17 | **Create new task** | Quick task creation | `POST /tasks` | Same as Tasks page #18 |
| 18 | **Daily summary header** | Date + greeting | Client-side | No API call |

### Data Flow

1. **Page load** — Fetch tasks for worker (1 call), resolve companies from cache (0 calls if cached)
2. **Client-side** — Group by company for "My Accounts", sort by priority for "My Queue"
3. **Lazy loads** — Task history, documents loaded on expand
4. **Timer** — Fully client-side until stopped, then 1 API call

### API Call Budget

| Scenario | Calls |
|----------|-------|
| Page load | 1-2 (+ bootstrap cache) |
| Start timer | 0 |
| Stop + log time | 1 |
| Complete task | 2 |
| Expand task history | 1 |
| Expand client docs | 1 |

---

## 5. Focus / Timer Session

**Route:** `/(app)/focus/page.tsx`
**Role:** Worker
**Purpose:** Full-screen distraction-free timer for a single task — big timer, progress, and actions to complete/pause/request info.

### Features

| # | Feature | Description | Accelo API Call(s) | Notes |
|---|---------|-------------|-------------------|-------|
| 1 | **Task fetch from URL** | Read `?task={id}`, fetch task data | `GET /tasks/{task_id}?_fields=id,title,against_type,against_id,date_due,task_status,task_priority,logged,budgeted,assignee` | Single call on mount |
| 2 | **Task metadata badges** | Client name, category, due date | Resolve company from cached B7. Category = parent job type | 0-1 additional calls |
| 3 | **Big timer display** | Large monospace countdown/up updated every second | **No API call.** `timer-store.ts` localStorage. `startTask(taskId)` on mount, `setInterval(tick, 1000)` | Entirely client-side |
| 4 | **Progress bar** | (loggedHours + liveElapsed/3600) / estimatedHours | From task `logged` + `budgeted` + live timer | Client-side computation |
| 5 | **Mark Complete** | Stop timer → log time → mark task done | `POST /activities` (billable seconds) + `PUT /tasks/{id}` (standing → complete) | 2 API calls. Completion screen is pure UI |
| 6 | **Request Info** | Stop timer → log time → mark waiting | `POST /activities` (log time) + `PUT /tasks/{id}` (standing → paused) | 2-3 API calls |
| 7 | **Pause / Skip** | Save to localStorage, navigate back | **No API call.** `pauseTask(taskId)` in localStorage | Time NOT logged to Accelo until explicitly stopped |
| 8 | **Paused tasks sidebar** | Other tasks with accumulated time | Batch fetch: `GET /tasks?_filters=id({id1},{id2},{id3})&_fields=id,title,company(name)` | Need task metadata for IDs in localStorage store |
| 9 | **Switch task** | Click paused task to switch focus | Navigation triggers re-mount → new `startTask()` in localStorage | Auto-pauses current task |
| 10 | **Timer persistence** | Survives page refresh | localStorage `sampson_timers` key | No Accelo involvement |
| 11 | **Quick new task + timer** | Create task then start timer | `POST /tasks` → get new task ID → `startTask(newId)` in localStorage | 1 API call for task creation, then client-side timer |

### Data Flow

1. **Mount** — Fetch task (1 call), start localStorage timer, resolve company from cache
2. **Every second** — localStorage read, re-render. Zero API calls
3. **On complete/request info** — POST activity + PUT task (2 calls). Show confirmation screen
4. **On pause** — localStorage only. Navigate back

### API Call Budget

| Scenario | Calls |
|----------|-------|
| Page load | 1-3 |
| Timer running | 0 |
| Mark Complete | 2 |
| Request Info | 2-3 |
| Pause / Skip | 0 |
| Switch task | 1-3 (new mount) |

---

## 6. Clients Page

**Route:** `/(app)/clients/page.tsx`
**Role:** Both (Manager + Worker)
**Purpose:** Client directory with health indicators, at-risk alerts, communication history, document vault, and financial overview.

### Features

| # | Feature | Description | Accelo API Call(s) | Notes |
|---|---------|-------------|-------------------|-------|
| 1 | **Client list/grid** | All clients as cards with name, status indicator | `GET /companies?_fields=id,name,website,phone,standing,company_status,date_last_interacted,comments&_filters=standing(active)&_limit=100` | Core data call. Paginate if >100 |
| 2 | **Entity type badge** | "S-Corp", "LLC", "Partnership" | **GAP.** No native field | Requires custom field in Accelo admin. Or parse from `comments` |
| 3 | **Industry label** | Industry below name | **GAP.** No native field | Same — requires custom field |
| 4 | **Health score ring** | 0-100 computed score | **Computed.** Weighted formula from: days since interaction, outstanding invoices, overdue tasks, contract standing | Requires data from multiple endpoints (see #4a-d) |
| 4a | **— Last interaction** | Days since last activity | From company `date_last_interacted` in #1 | Direct field |
| 4b | **— Outstanding invoices** | Total unpaid amount per client | `GET /invoices?_filters=outstanding_greater_than(0)&_fields=id,outstanding,date_due,affiliation(company(id))&_limit=100` | Batch all outstanding invoices, group by company client-side |
| 4c | **— Overdue tasks** | Count of overdue tasks per client | From task data (if already loaded) or `GET /tasks?_filters=date_due_before({now}),standing_not(complete)&_fields=id,company(id)&_limit=100` | Batch, group by company |
| 4d | **— Contract standing** | Active retainer status | `GET /contracts?_filters=standing(active)&_fields=id,company(id),title,value&_limit=100` | Batch all active contracts |
| 5 | **Team assigned** | Avatar group of staff working on this client | Derived from tasks: deduplicate `assignee` from all tasks for this company | **GAP.** No "assigned staff" on companies. Derive from task assignees |
| 6 | **Services list** | Badges: Bookkeeping, Payroll, etc. | From contracts (#4d) or jobs: `GET /jobs?_filters=company({id}),standing_not(complete)&_fields=title` | Contract/job titles = service lines |
| 7 | **Monthly retainer** | Dollar amount per month | From contracts (#4d) `value` field. For true monthly: need `GET /contracts/{id}/periods` | **N+1 risk** on contract periods. Cache aggressively |
| 8 | **Outstanding balance** | Unpaid invoice total | From #4b, summed per company | |
| 9 | **Last contact + type** | "3d ago" + email/call icon | `date_last_interacted` from #1. For type: `GET /activities?_filters=against_type(companies),against_id({id})&_fields=medium,date_created&_limit=1&order_by_desc(date_created)` | **GAP:** "text" is not a standard Accelo medium. Only email/call/meeting/note |
| 10 | **Status dot** | active / pending / at-risk | Accelo `standing` (active/inactive) + computed from health score | Map `company_status` to UI states |
| 11 | **Search clients** | Filter by name | Client-side filter | No additional call |
| 12 | **"Needs Attention" section** | At-risk clients with risk reasons | Subset of client cards, filtered by health score < threshold | Client-side logic from already-loaded data |
| 13 | **Suggested actions** | "Schedule urgent call with {teamLead}" | Client-side heuristic | No API call |
| 14 | **Communications tab** | Emails, calls sorted chronologically | `GET /activities?_filters=_OR(medium(email),medium(call),medium(meeting))&_fields=id,subject,preview_body,medium,against_type,against_id,staff,date_created&_limit=100&order_by_desc(date_created)` | "text" medium doesn't exist in Accelo |
| 15 | **Communication filter pills** | All / Email / Calls | Client-side filter on #14 | |
| 16 | **Unread indicator** | Blue border on unread items | **GAP.** Accelo has no per-user "read" status on activities | Workaround: localStorage tracking (given no-DB constraint) |
| 17 | **Document vault** | Per-client documents grouped by category | `GET /resources?_filters=against_type(companies),against_id({company_id})&_fields=id,title&_limit=100` | Lazy-load on drawer open |
| 18 | **Document metadata** | Date, size, extension, source | **GAP.** `/resources` returns limited metadata (id + title) | Workaround: encode metadata in filename convention `[2026-02-19] [Client] W-2 Forms.pdf` |
| 19 | **Add client** | Create new company | `POST /companies` with `{ name, standing: "active" }` | + custom field setup for entity type, industry |

### Data Flow

1. **Page load** — 5-6 parallel calls: companies, outstanding invoices, active contracts, overdue tasks, recent activities for last-contact type
2. **Client-side joins** — Company + invoices + contracts + tasks + activities → compute health scores, outstanding balances, team assignments, service lists
3. **Communications tab** — Separate activities fetch filtered by medium
4. **Document vault** — Lazy-load per client on drawer open

### API Call Budget

| Scenario | Calls |
|----------|-------|
| Page load | 5-6 |
| Communications tab | 0-1 (reuse or separate fetch) |
| Open document drawer | 1 per client |
| Add client | 1-3 |

---

## 7. Cross-Page API Budget

### Per-Hour Estimate (Active Manager + 2 Workers)

| Activity | Calls/hr | Source |
|----------|----------|--------|
| Session bootstrap (once) | 7 | All pages |
| Manager dashboard loads (5/hr) | 25-30 | Dashboard |
| Manager task expansions (15/hr) | 15-30 | Dashboard + Tasks |
| Manager writes (20/hr) | 20-40 | Tasks page |
| Worker page loads (2 workers × 5/hr) | 10-20 | Worker |
| Timer stops / time logging (10/hr) | 10-30 | Focus + Worker |
| Clients page loads (3/hr) | 15-18 | Clients |
| **TOTAL** | **~100-175/hr** | **3.5% of 5,000 limit** |

**Verdict:** Extremely comfortable. Even 10x this usage (10 active managers) stays under 2,000/hr.

### Rate Limit Safety Margins

| Concern | Budget | Risk |
|---------|--------|------|
| Normal usage | ~150/hr | None |
| Heavy bulk operations (100 task reassign) | +100 | Low |
| Initial data sync (all tasks, all companies) | ~50-100 | One-time |
| Worst case (all pages + bulk + sync) | ~400/hr | Safe |

---

## 8. Gap Resolutions

All 13 gaps resolved. Every solution uses Accelo's existing data model — no custom profile fields on tasks.

### Resolved Gaps

| # | Gap | Resolution | How It Works | Accelo Source |
|---|-----|------------|--------------|---------------|
| 1 | **Stage dwell time** | Use `date_modified` | `now - task.date_modified` = time in current status. Lossy (any edit resets it) but simple and sufficient | `task.date_modified` |
| 2 | **Dependencies** | AI-powered extraction from activities | Fetch activities for a task → pass to LLM → extract "waiting on X from Y" blocking items. Turns an API gap into a feature advantage | `GET /activities?_filters=against_type(tasks),against_id({id})` |
| 3 | **Task flagging** | Priority = flag | Flagging a task = set `task_priority` to Urgent (level 1). Filter "flagged" = `_filters=task_priority(1)`. Log escalation reason as an activity note | `task.task_priority` + `POST /activities` |
| 4 | **Recurring indicator** | Infer from title patterns | Detect keywords: "Monthly", "Payroll —", "Quarterly", "Bank Rec —", date patterns. Client-side heuristic, no API cost | `task.title` (pattern matching) |
| 5 | **Health score** | Computed weighted formula | 40% interaction recency + 30% invoice aging + 20% overdue tasks + 10% contract standing. All inputs from Accelo | Companies + Invoices + Tasks + Contracts |
| 6 | **Entity type / industry** | Custom profile fields in Accelo admin | Configure dropdown fields on companies in Accelo admin. Then queryable via `_fields=entity_type,industry` | Company custom profile fields |
| 7 | **Assigned team** | Company managers (already in Accelo) | `GET /companies/{id}/managers` returns the fixed staff team. Accelo already tracks this — no custom field needed | `/companies/{id}/managers` |
| 8 | **Service category** | Configure task types in Accelo | Set up Accelo task types to match firm taxonomy (Bookkeeping, AP & AR, Payroll, Sales Tax, Tax Returns, Advisory, etc.) | `task.task_type.title` |
| 9 | **Cost rate per staff** | Hardcode in app config | Define cost rates in a config file. Simple, rarely changes. Not stored in Accelo | App config (JSON/env) |
| 10 | **Documents** | Link to Accelo | List resources via `/resources`, show titles as clickable links to Accelo's web UI or `/resources/{id}/download` | `GET /resources` + constructed URL |
| 11 | **Communication read status** | Dropped | Don't track read/unread. Show chronological list. Accelo doesn't track it, we don't either | N/A |
| 12 | **PTO tracking** | Dropped from capacity | Don't show PTO in capacity card. PTO is tracked in ADP/Gusto, not Accelo | N/A |
| 13 | **"Text" communication** | Dropped | Only show email, call, meeting. Accelo's native mediums only | `activity.medium` (email/call/meeting/note) |
| 14 | **At-risk suggestions** | AI-powered | Feed client's activity history, invoice status, and task state to an LLM for actionable next-step suggestions | Activities + Invoices + Tasks → LLM |

### Action Items (Pre-Build)

Before implementation, configure in Accelo admin:
1. **Custom profile field on companies:** `entity_type` (dropdown: S-Corp, LLC, Partnership, C-Corp, Sole Prop, etc.)
2. **Custom profile field on companies:** `industry` (dropdown or text)
3. **Task status mapping:** Ensure statuses exist for: To Do, In Progress, In Review, Waiting on Client, Done, Cancelled
4. **Task type mapping:** Set up types to match firm categories: Bookkeeping, AP & AR, Payroll, Sales Tax, Bank & CC Rec's, Tax Returns, Tax Notices, Audits, Advisory, CFO Services, Cash Flow, Financial Statements
5. **Company managers:** Verify that client-to-team assignments are populated via Accelo's company managers feature

### AI-Powered Features (Require LLM Integration)

| Feature | Input (from Accelo) | AI Task |
|---------|---------------------|---------|
| **Dependency extraction** | Task activities (notes, emails, status changes) | Extract blocking items: "waiting on [item] from [source]" |
| **At-risk client suggestions** | Client activities + invoices + tasks + contracts | Generate actionable next steps: "Schedule call", "Follow up on invoice #123" |

These can use the Vercel AI SDK with the AI Gateway for model access.

---

## 9. Accelo Status Mapping

### Current Task Statuses (Live API — 2026-04-13)

> **WARNING:** The statuses below are what currently exists in this Accelo deployment.
> They do NOT match our desired pipeline. New statuses must be created in Accelo admin.

| ID | Accelo Status Title | Standing | Notes |
|----|---------------------|----------|-------|
| 2 | Pending | `pending` | Exists — maps to "To Do" |
| 3 | Accepted | `accepted` | Exists — maps to "To Do" (acknowledged) |
| 4 | Started | `started` | Exists — maps to "In Progress" |
| 5 | Complete | `complete` | Exists — maps to "Done" |
| 6 | Inactive | `inactive` | Exists — maps to "Cancelled/Archived" |
| 7 | Paused | `paused` | Exists — maps to "Waiting on Client" |

**There is NO `active` standing for tasks.** The `standing(active)` filter returns 0 results.
The correct filter for open work is: `standing_not(complete),standing_not(inactive)`

### Statuses to Create in Accelo Admin (Pre-Build)

| Desired Status | Standing | Purpose |
|---------------|----------|---------|
| In Review | (new, use `started` or custom) | Work done, awaiting manager review |
| Ready to Bill | (new, use `started` or custom) | Reviewed, ready for invoicing |
| Waiting on Client | (already exists as "Paused") | Blocked on client response |

### Proposed Status Mapping (After Admin Setup)

| Accelo Status Title | Standing | Dashboard Stage | Tasks Page Status | Worker View |
|---------------------|----------|-----------------|-------------------|-------------|
| Pending | pending | — | `todo` | `todo` |
| Accepted | accepted | — | `todo` | `todo` |
| Started | started | `in-progress` | `in-progress` | `in-progress` |
| In Review | started | `in-review` | `review` | `review` |
| Ready to Bill | started | `ready-to-bill` | `review` | — |
| Paused | paused | `waiting-on-client` | `todo` (flagged) | `waiting` |
| Complete | complete | (hidden) | `done` | `done` |
| Inactive | inactive | (hidden) | (hidden) | (hidden) |

### Activity Standing (Time Approval Flow)

```
unapproved → approved → invoiced → locked
```

Used for billing analytics — only `approved` or `invoiced` activities should count as confirmed revenue.

### Company Standing

| Accelo Standing | UI Status | Logic |
|-----------------|-----------|-------|
| active | `active` | Default |
| active + health < 70 | `at-risk` | Computed |
| inactive | `pending` | Or custom `company_status` |

---

## 10. Hybrid Architecture: Supabase Layer

**Decision (2026-04-13):** After rigorous feature-by-feature review, the pure Accelo approach was upgraded to a hybrid architecture. Accelo remains the source of truth for business data. Supabase provides:

1. **Synced read layer** — Core Accelo data mirrored in Supabase for instant reads, SQL joins, and full-text search
2. **Computed analytics** — Health scores, utilization, profitability rolled up in background jobs
3. **Event history** — Stage transitions tracked via polling (Accelo doesn't log these natively)
4. **AI output cache** — LLM results for dependencies and at-risk suggestions
5. **App-specific state** — Flags, recurring templates, cost rates, config, user preferences
6. **Auth** — Supabase Auth with magic link, mapped to Accelo staff_id
7. **WIP reporting** — Unbilled time (activities where standing ≠ invoiced/locked) rolled up by client, staff, service line

### What Moved to Supabase (vs Previous Pure-Accelo Plan)

| Feature | Previous Resolution | New Resolution | Why |
|---------|--------------------|----------------|-----|
| Health scores | Compute from 4 endpoints per company on load | DB-backed, background computed every 15 min | 602 companies × 4 calls = 2,400 API calls per load |
| Team utilization | Compute from activities on load | DB snapshots (hourly + daily) | Enables historical trending; 327K activities too large to scan live |
| Profitability | Accelo Object Budgets per project | DB rollups for cross-client/service-line analytics | Object Budgets are project-scoped, can't do firm-wide rollups |
| Stage transitions | `date_modified` proxy (lossy) | `task_transitions` table via polling | Accurate dwell time, bounce count, full audit trail |
| Dependencies | AI on-demand from activities | AI results cached in DB with staleness TTL | LLM calls too slow/expensive for every page render |
| At-risk suggestions | AI on-demand | AI results cached in DB | Same as above |
| Task flagging | Priority = flag (conflated) | Independent `task_flags` table with reason | Decouples priority from escalation |
| Recurring tasks | Title pattern heuristics | Full template system with auto-creation via cron | Firm needs workflow-defined recurrence, not title guessing |
| Cost rates | Hardcoded in app config | DB table, UI-editable by managers | Self-service configuration |
| Status mappings / weights | Would be code constants | DB `app_config` table | Tunable without redeployment |
| User preferences | Would be localStorage | DB `user_preferences` table | Cross-device persistence |
| Document metadata | Link to Accelo (minimal) | Sync metadata to DB + link to Accelo | Richer display without storing actual files |
| Auth | None planned | Supabase Auth (magic link) | Needed for preferences, flags, RLS |
| Access control | UI-level routing | Supabase RLS (manager vs worker) | Enforced at DB level |

### What Stayed Pure Accelo / Client-Side

| Feature | Approach | Why No DB Needed |
|---------|----------|------------------|
| Timer | localStorage → POST /activities on stop | Timer is ephemeral client state; Accelo is written on stop |
| Task CRUD | POST/PUT to Accelo API, then sync to DB | Accelo is source of truth for task data |
| Activity logging | POST to Accelo API | Time entries must be in Accelo for billing/invoicing |
| Company CRUD | POST/PUT to Accelo API | Companies are Accelo entities |
| Communication read status | Dropped | Low value, adds complexity |
| PTO tracking | Dropped | Tracked in ADP/Gusto, not Accelo |
| Text communication | Dropped | Accelo only has email/call/meeting/note mediums |

### Write-Through Flow

```
User Action → PUT /api/accelo/tasks/{id} (Accelo API)
  → On success: UPDATE supabase.tasks SET ... WHERE accelo_id = {id}
  → On failure: Show error, DB unchanged, Accelo unchanged
```

Accelo is always written first. Supabase is updated immediately on success (optimistic sync). Background cron handles any drift.

---

## 11. Supabase Schema

### Synced Mirror Tables

These tables mirror Accelo data for fast reads. Each has an `accelo_id` column and `synced_at` timestamp.

| Table | Source | Key Fields | Refresh |
|-------|--------|------------|---------|
| `staff` | `/staff` | accelo_id, firstname, surname, title, email, standing, rate_id | Every 1 hr |
| `companies` | `/companies` | accelo_id, name, standing, date_last_interacted, website, phone, **custom_entity_type, custom_industry** | Every 10 min |
| `tasks` | `/tasks` | accelo_id, title, against_type, against_id, **company_id (denormalized), job_id (denormalized)**, assignee_id, manager_id, status_id, priority_id, type_id, date_due, **date_created, date_started, date_completed**, budgeted, logged, remaining, standing, date_modified | Every 2 min |
| `activities` | `/activities` | accelo_id, subject, body, billable, nonbillable, staff_id, against_type, against_id, **task_id (from nested `task` field — critical, see §14 Finding 2)**, medium, **activity_class_id**, date_created, **date_logged**, rate_charged, standing | Every 2 min |
| `invoices` | `/invoices` | accelo_id, subject, amount, outstanding, date_raised, date_due, **date_paid**, company_id | Every 15 min |
| `contracts` | `/contracts` | accelo_id, title, value, company_id, standing, date_expires | Every 15 min |
| `resources` | `/resources` | accelo_id, title, against_type, against_id, **uploaded_at, uploaded_by_staff_id, category, year** (enriched from filename/activity) | Every 1 hr |
| `jobs` | `/jobs` | accelo_id, title, company_id, manager_id, standing, job_type | Every 10 min |

### Lookup Tables (Dimension Tables)

These resolve integer IDs to human-readable labels. Sync hourly (rarely change).

| Table | Source | Key Fields | Refresh |
|-------|--------|------------|---------|
| `task_statuses` | `GET /tasks/statuses` | accelo_id, title, standing | Every 1 hr |
| `task_priorities` | `GET /tasks/priorities` | accelo_id, title, level | Every 1 hr |
| `task_types` | `GET /tasks/types` | accelo_id, title | Every 1 hr |
| `rates` | `GET /rates` | accelo_id, title, charged | Every 1 hr |

> **Note on timestamps:** All Accelo Unix timestamps are converted to `TIMESTAMPTZ` on ingest.
> **Note on storage:** Consider truncating `activities.body` or excluding it for free-tier storage limits (327K bodies add up). Pro tier recommended.

### App-Specific Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `task_transitions` | Status change audit trail | task_accelo_id, from_status, to_status, changed_at, detected_at, **changed_by_staff_id, note** |
| `health_scores` | Computed client health | company_accelo_id, score, interaction_component, invoice_component, task_component, contract_component, computed_at |
| `analytics_snapshots` | Utilization, velocity, profitability rollups | snapshot_type, period_start, period_end, staff_id/company_id (nullable), data (JSONB), computed_at |
| `ai_cache` | LLM outputs | entity_type, entity_accelo_id, feature (dependencies/at_risk), result (JSONB), model_used, computed_at, stale_after |
| `task_flags` | Independent escalation flags | task_accelo_id, flagged_by (user_id), reason, note, flagged_at, resolved_at, resolved_by |
| `recurring_templates` | Task recurrence definitions | title_pattern, company_accelo_id, assignee_accelo_id, task_type_id, cadence (**weekly/biweekly/monthly/quarterly/semi-annual/annual**), day_of_month, **day_of_week (0-6), months (int[] for quarterly/annual, e.g. [1,4,7,10]), lead_days, default_budgeted_seconds, default_priority_id, is_compliance**, next_due, active, created_by, **last_created_at** |
| `staff_cost_rates` | Internal hourly cost per staff | staff_accelo_id, hourly_cost, effective_from, **effective_until**, updated_by |
| `app_config` | Tunable settings | key (TEXT PK), value (JSONB), updated_by, updated_at |
| `user_preferences` | Per-user UI state | user_id, preferences (JSONB: default_view, selected_worker, dashboard_range, etc.) |

### Auth Table (Supabase-managed)

`auth.users` — Supabase Auth handles this. Each user has a custom `staff_accelo_id` in metadata, linking their auth identity to their Accelo staff record.

---

## 12. Sync & Cron Strategy

### Vercel Cron Schedule

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/sync-tasks` | Every 2 min | Sync tasks + detect status transitions |
| `/api/cron/sync-activities` | Every 2 min | Sync recent activities |
| `/api/cron/sync-companies` | Every 10 min | Sync companies + jobs |
| `/api/cron/sync-invoices` | Every 15 min | Sync invoices + contracts |
| `/api/cron/sync-staff` | Every 1 hr | Sync staff + rates + resources + **lookup tables (statuses, priorities, types) + company_managers** |
| `/api/cron/compute-health` | Every 15 min | Recompute health scores from synced data |
| `/api/cron/compute-analytics` | Every 1 hr (+ daily snapshot) | Roll up utilization, velocity, profitability, **WIP** |
| `/api/cron/recurring-tasks` | Daily at 6:00 AM ET | Check recurring templates, create Accelo tasks for due items |
| `/api/cron/reconcile` | Daily at 2:00 AM ET | **Nightly reconciliation: compare record counts, catch deletions/drift** |

### Sync Logic

Each sync job follows this pattern:
1. **Acquire sync lock** (advisory lock or `sync_locks` row) to prevent concurrent execution
2. Query `sync_watermarks` table for last successful sync timestamp (avoids `MAX(synced_at)` table scan)
3. Fetch from Accelo with `_filters=date_modified_after({last_sync_ts})`
4. Upsert into Supabase (match on `accelo_id`) using `INSERT ... ON CONFLICT`
5. For tasks: compare `status_id` before/after upsert → write `task_transitions` row if changed
6. Update `sync_watermarks` only on success (self-healing on Accelo downtime)
7. Release sync lock

**Important API filter:** Use `standing_not(complete),standing_not(cancelled)` instead of `standing(active)` — Accelo uses `paused` for in-progress tasks (0 tasks have `active` standing).

### Initial Seed

On first deploy, a one-time seed job populates Supabase. **Critical: use date-range windowing for activities** (327K records). Deep pagination (page 3000+) may hit Accelo's offset limits.

| Entity | Records | Strategy | Est. API Calls |
|--------|---------|----------|---------------|
| Tasks | 30K | Sequential pagination | ~300 |
| Activities | 327K | **Window by month** (`date_created_after/before`) | ~3,274 (spread across ~14 monthly windows) |
| Companies | 1.2K | Sequential pagination | ~12 |
| Jobs | 2.1K | Sequential pagination | ~22 |
| Invoices | 5.4K | Sequential pagination | ~55 |
| Everything else | <200 | Single page | ~10 |
| **Total** | | | **~3,673 calls (~55 min at 4,000/hr throttle)** |

Run during off-hours. After seed, bootstrap `task_transitions` with one row per task (current status + `now()` as first transition).

### Nightly Reconciliation

A daily job compares Supabase record counts with Accelo to catch:
- Deletions (missed by `date_modified_after`)
- Pagination gaps from the initial seed
- Any sync drift

### Sync Watermarks Table

```sql
CREATE TABLE sync_watermarks (
  entity_type TEXT PRIMARY KEY,  -- 'tasks', 'activities', 'companies', etc.
  last_synced_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ NOT NULL,
  records_synced INT DEFAULT 0
);
```

---

## 13. Auth & Access Control

### Authentication

- **Method:** Supabase Auth with magic link (passwordless email)
- **Users:** 16 active staff members + admin
- **Mapping:** Each `auth.users` record has `raw_user_meta_data.staff_accelo_id` linking to Accelo
- **Session:** Supabase JWT in cookie, verified by Next.js middleware

### Role-Based Access (Supabase RLS)

| Role | Scope | Enforcement |
|------|-------|-------------|
| `manager` | All data across all staff and clients | Full SELECT/INSERT/UPDATE on all tables |
| `worker` | Own tasks + **team client tasks (read-only)**. Own preferences, own flags. | RLS policies filter by `auth.uid()` → `staff_accelo_id` → `assignee_id` OR company managers membership |

Role is stored in `auth.users.raw_user_meta_data.role` and `staff_accelo_id` in JWT claims. Referenced in RLS policies via helper functions (not subselects, for performance).

### RLS Helper Functions (Performance)

```sql
-- Use STABLE functions reading from JWT claims, NOT subselects to auth.users
CREATE OR REPLACE FUNCTION auth_role() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('request.jwt.claims', true)::json->>'role', 'worker')
$$;

CREATE OR REPLACE FUNCTION auth_staff_id() RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT (current_setting('request.jwt.claims', true)::json->>'staff_accelo_id')::int
$$;
```

### Worker RLS — Team-Based Access

Workers see tasks where they are assignee OR the task's client is one of their assigned companies (via company_managers). This supports the team-based service model (if Gio is out, Musa can see OES tasks).

```sql
CREATE POLICY "Workers see own + team tasks"
  ON tasks FOR SELECT
  USING (
    auth_role() = 'manager'
    OR assignee_id = auth_staff_id()
    OR company_id IN (
      SELECT company_accelo_id FROM company_managers WHERE staff_accelo_id = auth_staff_id()
    )
  );
```

### Write Policies

| Table | Worker Can | Manager Can |
|-------|-----------|-------------|
| `tasks` | UPDATE own tasks (status, priority) | Full CRUD |
| `task_flags` | INSERT/UPDATE own flags | Full CRUD |
| `user_preferences` | INSERT/UPDATE own row | Full CRUD |
| `activities` | INSERT (log time) | Full CRUD |
| `staff_cost_rates` | — | INSERT/UPDATE |
| `app_config` | — | UPDATE |
| `recurring_templates` | — | Full CRUD |

### Cron Endpoint Security

All `/api/cron/*` routes must verify the `CRON_SECRET` header provided by Vercel:

```typescript
if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response('Unauthorized', { status: 401 });
}
```

### Company Managers Table

To support team-based RLS, sync Accelo's `/companies/{id}/managers` into a join table:

| Table | Source | Key Fields | Refresh |
|-------|--------|------------|---------|
| `company_managers` | `GET /companies/{id}/managers` | company_accelo_id, staff_accelo_id | Every 1 hr |

---

## 14. Live API Test Results (2026-04-13)

> Tested against the live `sampsonllc` Accelo deployment using the `client_credentials` token.

### Critical Tests — All PASSED

| Test | Result | Details |
|------|--------|---------|
| `POST /activities` with `owner_id` ≠ token owner | **PASS** | Posted with `owner_id=5` (Mitchell), token belongs to Daohao (id:37). Activity correctly attributed to Mitchell. Timer architecture is viable. |
| `POST /activities` with `billable` seconds | **PASS** | Posted `billable=60` with `owner_id=13` (Gio). Billable seconds recorded correctly. Standing = `unapproved` (correct entry point for billing pipeline). |
| `DELETE /activities/{id}` | **PASS** | Test activities cleaned up successfully. |
| `/tasks/statuses` endpoint | **PASS** | Returns 6 statuses. Endpoint works. |
| `/rates` endpoint | **PASS** | Returns all rate tiers with charged amounts. |

### Findings That Require Plan Changes

#### Finding 1: `against_type` Must Be SINGULAR for POSTs

`POST /activities` with `against_type=tasks` (plural) returns `invalid_request`. Must use `against_type=task` (singular).

**Impact:** All POST/PUT examples in this doc and ACCELO_API_FINDINGS.md use plural form. All must be corrected:
- POST activities: `against_type=task` (not `tasks`)
- GET activities filters: `_filters=against_type(tasks)` (plural is OK for filters)
- POST tasks: `against_type=job` or `against_type=company` (singular)

#### Finding 2: Accelo Re-Parents Activities to Job Level

When posting `against_type=task, against_id=16881`, Accelo stores the activity as:
```
against_type: "job"
against_id: 1049  (the parent job of task 16881)
task.id: 16881    (preserved as a separate nested field)
```

**Impact:**
- `_filters=against_type(task),against_id({task_id})` **WILL NOT WORK** for activities logged against tasks
- Must use the `task` nested field or `_filters=task_id({task_id})` to find activities for a specific task
- Supabase `activities` table must store `task_id` as a separate column (not derivable from `against_type/against_id`)
- All dashboard/worker queries that fetch "activities for this task" must be updated

**Added to Supabase schema:** `activities.task_id` column (nullable INT, populated from the `task(id)` nested field on sync).

#### Finding 3: Actual Task Statuses Don't Match Our Plan

See Section 9 above for the full mapping. Key points:
- Only 6 statuses exist: Pending, Accepted, Started, Complete, Inactive, Paused
- **No `active` standing exists.** `standing(active)` returns 0 results.
- Must create "In Review", "Ready to Bill" in Accelo admin before implementing
- Correct filter for open work: `standing_not(complete),standing_not(inactive)`

#### Finding 4: `rate_charged` Is NOT Auto-Populated

Posting an activity without `rate_id` results in `rate_charged=0.00`. Accelo does NOT auto-apply the staff member's default rate.

**Impact:** When logging time from the frontend timer, we must:
1. Look up the staff member's `rate_id` from the `staff` table
2. Look up the task's `rate_id` if it has one (task-level rate overrides staff rate)
3. Pass `rate_id` explicitly in the `POST /activities` payload

**Fallback:** If no rate is specified, the activity logs time correctly (billable seconds counted) but shows $0.00 revenue. The rate can be corrected later in Accelo's approval flow.

#### Finding 5: Nested `rate()` Expansion Doesn't Work on Staff

`GET /staff?_fields=rate(id,charged)` returns no rate data. Must use `_fields=rate_id` and join with the `rates` lookup table.

**Impact:** Confirms the `rates` lookup table is critical. Staff → rate resolution requires a two-step lookup: `staff.rate_id` → `rates.charged`.

#### Finding 6: Actual Billing Rates

| ID | Title | Charged | Standing |
|----|-------|---------|----------|
| 18 | Sr. Profit and Growth Accountants | $45.00/hr | active |
| 19 | Jr. Profit and Growth Accountant | $35.00/hr | active |
| 22 | Executive Leadership | $100.00/hr | active |
| 24 | Admin | $11.00/hr | active |

Mock data had $85-$350/hr. Actual rates are significantly lower. Mock data should be updated OR the firm uses different rates for different contexts (retainer vs project). Historical inactive rates go up to $500/hr (Partner).

---

## 15. Pre-Build Checklist (Updated)

### COMPLETED (Tested Live)

- [x] **Test `POST /activities` with `owner_id` ≠ token owner** — PASSED. Timer architecture works.
- [x] **Verify `standing` values** — No `active` standing. Use `standing_not(complete),standing_not(inactive)`.
- [x] **Verify `/tasks/statuses` endpoint** — Works. 6 statuses, need to add more.
- [x] **Verify `/rates` endpoint** — Works. 4 active rates ($11-$100/hr).
- [x] **Verify `against_type` for POSTs** — Must be singular (`task` not `tasks`).
- [x] **Verify activity re-parenting** — Confirmed. Activities posted against tasks are stored against parent jobs. `task_id` field preserved.

### Must Do Before First Migration

- [ ] Supabase Pro plan required (2-min cron intervals, storage, connection pooling)
- [ ] Add `ACCELO_API_FINDINGS.md` to `.gitignore` (contains plaintext API secret)
- [ ] Use Supabase connection pooler (Supavisor) in transaction mode for all serverless functions
- [ ] Create missing task statuses in Accelo admin: "In Review", "Ready to Bill"
- [ ] Verify which standing values the new statuses get (likely `started`)

### Still Need to Verify (During Implementation)

- [ ] Verify `/companies/{id}/managers` endpoint exists and returns staff list
- [ ] Verify `_fields=task_status(id,title,standing)` nested expansion on `/tasks`
- [ ] Test whether tasks can be created with `against_type=company` (not just `against_type=job`)
- [ ] Verify `has_attachment(1)` filter on activities
- [ ] Test deep pagination limits — confirm date-range windowing is needed for 327K activities
- [ ] Test whether `rate_id` can be set on `POST /activities` or must be set on the task
- [ ] Verify `_filters=task_id({id})` works for filtering activities by task
