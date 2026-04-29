# UI vs Accelo Data Model Mapping

> **Sampson HQ** uses a hybrid architecture: Accelo is the source of truth for business data,
> with Supabase as the read layer, computed analytics store, and app-specific state.
> Writes go to Accelo first, then sync to Supabase. See `PAGE_BY_PAGE_BREAKDOWN.md` §10-13
> for the full Supabase schema, sync strategy, and auth/access control.
>
> This document maps every current UI type to Accelo's API surface, identifies
> transformations, gaps, multi-call requirements, and proposes Accelo-native types
> for the integration layer. Many previously-flagged gaps are now resolved via Supabase tables.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Type-by-Type Mapping](#2-type-by-type-mapping)
   - [TeamMember](#21-teammember)
   - [Client](#22-client)
   - [Task](#23-task)
   - [RichTask (Manager Dashboard)](#24-richtask-manager-dashboard)
   - [TimeEntry](#25-timeentry)
   - [ClientDocument](#26-clientdocument)
   - [Communication](#27-communication)
   - [TimerEntry (Timer Store)](#28-timerentry-timer-store)
3. [Proposed Accelo-Native Types](#3-proposed-accelo-native-types)
4. [Multi-Call Requirements](#4-multi-call-requirements)
5. [Computed Fields](#5-computed-fields)
6. [Key Differences Summary Table](#6-key-differences-summary-table)

---

## 1. Overview

### Philosophy

Sampson HQ is a Next.js application that serves as the operational dashboard for a
professional-services (accounting) firm. Accelo is the canonical system of record for
staff, companies, tasks, time tracking, invoicing, and communications. Supabase provides
the read layer (synced mirrors), computed analytics, event history, AI cache, and app state.
Writes go to Accelo first, then sync to Supabase.

### Architectural Implications

- **Every UI field** either maps 1:1 to an Accelo/Supabase field, is derived/computed from
  one or more fields, or is stored as app-specific state in Supabase.
- **Reads** come from Supabase (synced mirrors + computed tables). The UI reads from
  Supabase, never directly from the Accelo API on page load.
- **Writes** go to the Accelo API first, then update Supabase on success.
- **Multi-call joins** (e.g., Company + Contracts + Invoices to build a Client card) are
  now SQL joins in Supabase rather than multi-endpoint API orchestration.

### Accelo Terminology Crosswalk

| Accelo Term  | Sampson HQ Term | Notes                            |
|-------------|-----------------|----------------------------------|
| Staff       | TeamMember      | Accelo users / employees         |
| Company     | Client          | The firm's clients               |
| Task        | Task / RichTask | Work items assigned to staff     |
| Activity    | TimeEntry / Communication | Logged work, emails, calls |
| Job         | (Project)       | Groups of tasks; maps to engagements |
| Contract    | Retainer        | Recurring billing agreements     |
| Invoice     | (Invoice)       | Bills sent to clients            |
| Resource    | ClientDocument  | Files attached to any object     |
| Affiliation | (Contact-Company join) | Links contacts to companies |
| Rate        | Billing/Cost Rate | Hourly rate definitions        |
| Timer       | TimerEntry      | User-scoped running clock        |

---

## 2. Type-by-Type Mapping

### 2.1 TeamMember

**Current UI type** (`src/lib/data.ts`):

```typescript
type TeamMember = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  utilization: number;
  billableHours: number;
  totalHours: number;
  billingRate: number;
  costRate: number;
};
```

#### Field Mapping

| UI Field       | Accelo Source                                           | Endpoint                 | Transformation                              |
|----------------|--------------------------------------------------------|--------------------------|---------------------------------------------|
| `id`           | `staff.id`                                             | `GET /staff`             | Cast to string                              |
| `name`         | `staff.firstname` + `staff.surname`                    | `GET /staff`             | Concatenate with space                      |
| `role`         | `staff.title` or `staff.position`                      | `GET /staff`             | Direct mapping; `title` preferred           |
| `avatar`       | --                                                     | --                       | **Computed**: initials from `firstname`/`surname` |
| `utilization`  | --                                                     | --                       | **Computed**: `billableHours / totalHours * 100` (see [Computed Fields](#5-computed-fields)) |
| `billableHours`| Sum of `activity.billable` for staff in period         | `GET /activities` (filtered by `staff_id`, `date_created` range) | Seconds to hours: `/ 3600` |
| `totalHours`   | Sum of `activity.billable` + `activity.nonbillable`    | `GET /activities` (same filter) | Seconds to hours: `/ 3600`            |
| `billingRate`  | `rate.charged` (linked to staff's default rate)        | `GET /rates/{id}`        | Direct (already dollars/hour)               |
| `costRate`     | --                                                     | --                       | **GAP**: Accelo does not expose internal cost rates. Must be stored as a custom field on Staff or managed externally. |

#### Gaps

| Field      | Issue                                                                                     | Resolution Options                                                         |
|------------|-------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| `costRate` | Accelo has no concept of internal cost rate (salary-equivalent hourly cost).               | 1) Custom field on Staff object. 2) External config file/env variable lookup table. 3) Accelo "Rates" object with a "cost" rate type (not natively supported). |
| `avatar`   | Accelo has no profile image URL. Current mock uses initials.                               | Keep computed initials, or integrate Gravatar via `staff.email`.            |

#### Accelo Fields We SHOULD Use But Don't

| Accelo Field          | Why It's Useful                                              |
|-----------------------|--------------------------------------------------------------|
| `staff.email`         | Enable Gravatar avatar, mailto links                         |
| `staff.standing`      | Filter out inactive/lockout staff from team views            |
| `staff.access_level`  | Role-based UI logic (manager vs worker) without hardcoding   |
| `staff.timezone`      | Display localized deadlines                                  |
| `staff.phone`/`mobile`| Quick contact actions from team roster                       |

---

### 2.2 Client

**Current UI type** (`src/lib/data.ts`):

```typescript
type Client = {
  id: string;
  name: string;
  entityType: string;
  industry: string;
  teamLead: string;
  assignedTo: string[];
  services: string[];
  healthScore: number;
  monthlyRetainer: number;
  outstandingBalance: number;
  lastContact: string;
  lastContactType: "email" | "call" | "text";
  status: "active" | "pending" | "at-risk";
};
```

#### Field Mapping

| UI Field            | Accelo Source                                                       | Endpoint(s)                                    | Transformation                                         |
|---------------------|---------------------------------------------------------------------|------------------------------------------------|--------------------------------------------------------|
| `id`                | `company.id`                                                        | `GET /companies`                               | Cast to string                                         |
| `name`              | `company.name`                                                      | `GET /companies`                               | Direct                                                 |
| `entityType`        | --                                                                  | --                                             | **GAP**: No native field. Use custom field on Company. |
| `industry`          | --                                                                  | --                                             | **GAP**: No native field. Use custom field on Company. |
| `teamLead`          | `job.manager` (primary Job for this company) or custom field        | `GET /jobs?company_id={id}`                    | Resolve `staff.firstname + surname` from manager object |
| `assignedTo`        | Staff assigned to tasks/jobs under this company                     | `GET /tasks?company_id={id}` then unique assignees | Collect unique `task.assignee` staff names          |
| `services`          | `job.job_type` or `task.task_type` values for this company          | `GET /jobs?company_id={id}` / `GET /tasks`     | Collect unique type titles                             |
| `healthScore`       | --                                                                  | --                                             | **Computed**: see [Computed Fields](#5-computed-fields) |
| `monthlyRetainer`   | `contract.value` (active contract for company)                      | `GET /contracts?company_id={id}&standing=active` | Direct (currency value)                              |
| `outstandingBalance`| Sum of `invoice.outstanding` for company                            | `GET /invoices?affiliation_company_id={id}`    | Sum all `invoice.outstanding` values                   |
| `lastContact`       | `company.date_last_interacted`                                      | `GET /companies/{id}`                          | Unix timestamp to `YYYY-MM-DD` string                  |
| `lastContactType`   | Most recent `activity.medium` where `against_id` = company          | `GET /activities?against_type=company&against_id={id}&_limit=1&_order_by=date_created_desc` | Map: `"email"` -> `"email"`, `"call"` -> `"call"`. Accelo has no `"text"` medium. |
| `status`            | `company.standing` + `company.company_status`                       | `GET /companies/{id}`                          | **Computed**: Map `standing=active` -> `"active"`, combine with health score to derive `"at-risk"`, etc. |

#### Gaps

| Field            | Issue                                                                                      | Resolution Options                                               |
|------------------|--------------------------------------------------------------------------------------------|------------------------------------------------------------------|
| `entityType`     | No native Accelo field for corporate structure (S-Corp, LLC, C-Corp, etc.)                 | Custom field on Company object in Accelo                         |
| `industry`       | No native industry classification in Accelo                                                | Custom field on Company object in Accelo                         |
| `healthScore`    | Entirely synthetic; no Accelo equivalent                                                   | Computed client-side from multiple signals (see section 5)       |
| `lastContactType` = `"text"` | Accelo `activity.medium` values are: `note`, `email`, `meeting`, `call`, `postal`. No SMS/text. | Map `"text"` to a custom medium or treat as `"note"`, or integrate SMS via webhook/custom activity |
| `status` = `"at-risk"` / `"pending"` | These are Sampson-specific classifications, not native Accelo statuses           | Computed from health score threshold + `company.standing`        |

#### Accelo Fields We SHOULD Use But Don't

| Accelo Field                 | Why It's Useful                                              |
|------------------------------|--------------------------------------------------------------|
| `company.website`            | Client quick-links                                           |
| `company.phone`              | Click-to-call                                                |
| `company.date_created`       | "Client since" badge                                         |
| `company.staff_bookmarked`   | Quick-access / favorite clients                              |
| `company.comments`           | Internal notes about the client                              |
| `company.postal_address`     | Client directory                                             |

---

### 2.3 Task

**Current UI type** (`src/lib/data.ts`):

```typescript
type Task = {
  id: string;
  title: string;
  client: string;
  assignee: string;
  category: string;
  priority: "high" | "medium" | "low";
  status: "todo" | "in-progress" | "review" | "done";
  dueDate: string;
  estimatedHours: number;
  loggedHours: number;
  recurring: boolean;
};
```

#### Field Mapping

| UI Field          | Accelo Source                                                        | Endpoint                       | Transformation                                        |
|-------------------|----------------------------------------------------------------------|--------------------------------|-------------------------------------------------------|
| `id`              | `task.id`                                                            | `GET /tasks`                   | Cast to string                                        |
| `title`           | `task.title`                                                         | `GET /tasks`                   | Direct                                                |
| `client`          | `task.company.name`                                                  | `GET /tasks` (with `_fields=company`)  | Resolve nested company object to `.name`       |
| `assignee`        | `task.assignee.firstname` + `task.assignee.surname`                  | `GET /tasks` (with `_fields=assignee`) | Concatenate name parts                         |
| `category`        | `task.task_type.title`                                               | `GET /tasks` (with `_fields=task_type`)| Resolve nested object `.title`                 |
| `priority`        | `task.task_priority.title` or `task.task_priority.level`             | `GET /tasks` (with `_fields=task_priority`) | Map Accelo priority levels to `"high"` / `"medium"` / `"low"` |
| `status`          | `task.task_status.title` + `task.task_status.standing`               | `GET /tasks` (with `_fields=task_status`) | Map Accelo status titles to UI enum. See mapping table below. |
| `dueDate`         | `task.date_due`                                                      | `GET /tasks`                   | Unix timestamp to `YYYY-MM-DD` string                 |
| `estimatedHours`  | `task.budgeted`                                                      | `GET /tasks`                   | Seconds to hours: `/ 3600`                            |
| `loggedHours`     | `task.logged`                                                        | `GET /tasks`                   | Seconds to hours: `/ 3600`                            |
| `recurring`       | --                                                                   | --                             | **GAP**: Accelo tasks don't have a native "recurring" flag. See below. |

##### Status Mapping (Verified Live — 2026-04-13)

The Accelo deployment has 6 task statuses. Standings are NOT `open/complete` as the docs
suggest — they are: `pending`, `accepted`, `started`, `complete`, `inactive`, `paused`.
**There is no `active` standing.** "In Review" and "Ready to Bill" must be created in Accelo admin.

| UI Status       | Accelo `task_status.title` | Accelo `task_status.standing` | ID |
|-----------------|----------------------------|-------------------------------|----|
| `"todo"`        | Pending                    | `pending`                     | 2  |
| `"todo"`        | Accepted                   | `accepted`                    | 3  |
| `"in-progress"` | Started                    | `started`                     | 4  |
| `"waiting"`     | Paused                     | `paused`                      | 7  |
| `"review"`      | *In Review* (TO CREATE)    | `started`                     | —  |
| `"review"`      | *Ready to Bill* (TO CREATE)| `started`                     | —  |
| `"done"`        | Complete                   | `complete`                    | 5  |
| (hidden)        | Inactive                   | `inactive`                    | 6  |

> **Pre-build action**: Create "In Review" and "Ready to Bill" statuses in Accelo admin.
> Open-work filter: `standing_not(complete),standing_not(inactive)` — NOT `standing(active)`.

#### Gaps

| Field       | Issue                                                                                      | Resolution Options                                               |
|-------------|--------------------------------------------------------------------------------------------|------------------------------------------------------------------|
| `recurring` | Accelo has no native recurring-task flag or recurrence engine for tasks.                    | 1) Use a custom field on Task. 2) Use Accelo's Job templates and programmatically generate tasks on a schedule (cron). 3) Tag recurring tasks with a naming convention or custom field. |

#### Accelo Fields We SHOULD Use But Don't

| Accelo Field             | Why It's Useful                                              |
|--------------------------|--------------------------------------------------------------|
| `task.description`       | Task detail view, hover previews                             |
| `task.manager`           | Distinguish "assigned by" from "assigned to"                 |
| `task.date_created`      | "Created" timestamp for task age tracking                    |
| `task.date_started`      | Actual start vs planned start                                |
| `task.date_completed`    | Completion timestamp for velocity metrics                    |
| `task.remaining`         | Remaining budgeted seconds (complements logged)              |
| `task.billable`          | Billable seconds (separate from total logged)                |
| `task.nonbillable`       | Non-billable seconds                                         |
| `task.rate_id`           | Link to billing rate for revenue calculations                |
| `task.rate_charged`      | Actual rate applied                                          |
| `task.standing`          | Active / cancelled / completed filter                        |
| `task.against_type/id`   | Link tasks to Jobs, Companies, or Contacts                   |
| `task.milestone`         | Group tasks under milestones within a Job                    |
| `task.skills`            | Skill-based assignment / filtering                           |

---

### 2.4 RichTask (Manager Dashboard)

**Current UI type** (`src/app/(app)/page.tsx`):

```typescript
type RichTask = {
  id: string;
  client: string;
  serviceType: string;
  deliverable: string;
  deadline: string;
  assignee: string;
  assignedBy: string;
  assignedAt: string;
  stage: "waiting-on-client" | "in-progress" | "in-review" | "ready-to-bill";
  stageEnteredAt: string;
  priority: "high" | "medium" | "low";
  estimatedHours: number;
  loggedHours: number;
  hoursLoggedToday?: number;
  completedToday?: boolean;
  dependencies: Dependency[];
  history: StageHistoryEntry[];
  notes: TaskNote[];
};
```

RichTask is a **superset** of Task with additional manager-facing context. It requires
the most complex multi-call assembly.

#### Field Mapping

| UI Field            | Accelo Source                                                           | Endpoint(s)                                | Transformation                                        |
|---------------------|-------------------------------------------------------------------------|--------------------------------------------|-------------------------------------------------------|
| `id`                | `task.id`                                                               | `GET /tasks`                               | Cast to string                                        |
| `client`            | `task.company.name`                                                     | `GET /tasks` (with `_fields=company`)      | Resolve nested company `.name`                        |
| `serviceType`       | `task.task_type.title`                                                  | `GET /tasks` (with `_fields=task_type`)    | Direct                                                |
| `deliverable`       | `task.title`                                                            | `GET /tasks`                               | Direct (task title IS the deliverable name)            |
| `deadline`          | `task.date_due`                                                         | `GET /tasks`                               | Unix timestamp to `YYYY-MM-DD`                        |
| `assignee`          | `task.assignee.firstname` + `surname`                                   | `GET /tasks` (with `_fields=assignee`)     | Concatenate                                           |
| `assignedBy`        | `task.manager.firstname` + `surname`                                    | `GET /tasks` (with `_fields=manager`)      | Concatenate. Manager = person who assigned.            |
| `assignedAt`        | `task.date_created` or `task.date_started`                              | `GET /tasks`                               | Unix timestamp to `YYYY-MM-DD`                        |
| `stage`             | `task.task_status.title`                                                | `GET /tasks` (with `_fields=task_status`)  | Map Accelo statuses. See stage mapping below.          |
| `stageEnteredAt`    | `task.date_modified`                                                    | `GET /tasks`                               | Unix timestamp to `YYYY-MM-DD`. **Approximation** -- see note. |
| `priority`          | `task.task_priority.title`                                              | `GET /tasks` (with `_fields=task_priority`)| Map to `"high"` / `"medium"` / `"low"`               |
| `estimatedHours`    | `task.budgeted`                                                         | `GET /tasks`                               | Seconds to hours: `/ 3600`                            |
| `loggedHours`       | `task.logged`                                                           | `GET /tasks`                               | Seconds to hours: `/ 3600`                            |
| `hoursLoggedToday`  | Sum of `activity.billable + activity.nonbillable` where `date_logged` = today and `task_id` = this task | `GET /activities?task_id={id}&date_logged_after={today_start}&date_logged_before={today_end}` | Seconds to hours |
| `completedToday`    | `task.date_completed` falls within today                                | `GET /tasks`                               | Compare unix timestamp to today's date range          |
| `dependencies`      | --                                                                      | --                                         | **GAP**: See below                                    |
| `history`           | Activities against this task with `medium=note`                         | `GET /activities?against_type=task&against_id={id}&_order_by=date_created` | Build array from activity log. **Partial** -- status transitions aren't explicitly logged as activities. |
| `notes`             | Activities with `medium=note` against this task                         | `GET /activities?against_type=task&against_id={id}&medium=note` | Map `body` -> `text`, `staff` -> `by`, `date_created` -> `at` |

##### Stage Mapping

| UI Stage              | Accelo `task_status.title` (example)      |
|-----------------------|-------------------------------------------|
| `"waiting-on-client"` | "Waiting on Client", "Blocked"            |
| `"in-progress"`       | "In Progress", "Active"                   |
| `"in-review"`         | "In Review", "Awaiting Approval"          |
| `"ready-to-bill"`     | "Ready to Bill", "Approved"               |

> These must be configured as custom task statuses in the Accelo deployment.

##### `stageEnteredAt` Accuracy Note

Accelo's `date_modified` updates on ANY field change, not just status transitions.
For accurate stage-entry timestamps, either:
1. Query the task's activity/history log for the most recent status-change activity.
2. Use Accelo webhooks to capture status transitions in real time and record the timestamp.

#### Gaps

| Field           | Issue                                                                                      | Resolution Options                                                       |
|-----------------|--------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| `dependencies`  | Accelo tasks have no native dependency/blocker model.                                      | 1) Use Activities with a custom `activity_class` to represent blockers. 2) Custom fields on Task with structured JSON. 3) Model as related Issues (Cases) linked to the task. |
| `history`       | Accelo does not log status transitions as discrete, queryable events. Activities are the closest proxy but don't guarantee a 1:1 record of every status change. | Use Accelo webhooks to capture `task.status_changed` events and store stage history in Activities with a dedicated class. |
| `stageEnteredAt`| `date_modified` is a rough proxy (see note above).                                         | Webhook-driven activity logging on status change.                         |
| `hoursLoggedToday` | Requires a separate filtered activity query per task per day.                           | Batch with `GET /activities?staff_id=X&date_logged_after=Y&date_logged_before=Z` and aggregate client-side. |

#### Accelo Fields We SHOULD Use But Don't

| Accelo Field             | Why It's Useful                                              |
|--------------------------|--------------------------------------------------------------|
| `task.remaining`         | Show remaining budget directly instead of computing `estimated - logged` |
| `task.rate_charged`      | Calculate dollar value of logged work for "ready-to-bill" stage |
| `task.against_type/id`   | Link RichTask to its parent Job for project-level rollups     |
| `task.creator` / `creator_id` | True creator (may differ from manager)                  |

---

### 2.5 TimeEntry

**Current UI type** (`src/lib/data.ts`):

```typescript
type TimeEntry = {
  id: string;
  taskId: string;
  member: string;
  client: string;
  category: string;
  description: string;
  duration: number;
  date: string;
  billable: boolean;
};
```

#### Field Mapping

| UI Field      | Accelo Source                                                           | Endpoint                          | Transformation                                        |
|---------------|------------------------------------------------------------------------|-----------------------------------|-------------------------------------------------------|
| `id`          | `activity.id`                                                          | `GET /activities`                 | Cast to string                                        |
| `taskId`      | `activity.task.id`                                                     | `GET /activities` (with `_fields=task`) | Cast to string; empty string if no task linked   |
| `member`      | `activity.staff.firstname` + `surname`                                 | `GET /activities` (with `_fields=staff`) | Concatenate                                     |
| `client`      | Resolved via `activity.against_id` when `against_type=company`, OR via `task.company.name` | `GET /activities`, then `GET /companies/{against_id}` or resolve from task | Multi-step resolution |
| `category`    | Task type title (from linked task) or `activity.activity_class.title`  | Via linked task or activity metadata | Resolve from parent task's `task_type` or activity class |
| `description` | `activity.subject` or `activity.body`                                  | `GET /activities`                 | Use `subject` as primary, `body` for detail view      |
| `duration`    | `activity.billable + activity.nonbillable`                             | `GET /activities`                 | Seconds to hours: `/ 3600`                            |
| `date`        | `activity.date_logged` or `activity.date_created`                      | `GET /activities`                 | Unix timestamp to `YYYY-MM-DD`                        |
| `billable`    | Derived from `activity.billable > 0`                                   | `GET /activities`                 | Boolean: `true` if `billable > 0`, `false` if only `nonbillable > 0` |

#### Notes on Accelo's Activity Model

Accelo Activities are more general than the UI's TimeEntry concept. An Activity can
represent logged time (matching TimeEntry), but also emails, meetings, notes, and calls.
To extract only "time entries," filter by:

```
GET /activities?medium=note&billable_greater_than=0   (billable time)
GET /activities?medium=note&nonbillable_greater_than=0 (non-billable time)
```

Or more broadly, any Activity with `billable > 0 OR nonbillable > 0` represents logged time.

#### Critical: Activity Re-Parenting (Verified 2026-04-13)

When activities are posted with `against_type=task`, Accelo **re-parents** them to the
parent job level. The stored activity has `against_type=job, against_id={parent_job_id}`,
but preserves the original task link in a separate `task` nested field.

**Impact on TimeEntry resolution:**
- `_filters=against_type(task),against_id({task_id})` will **NOT find** activities logged against tasks
- Use `_fields=task(id)` and filter by `task_id` instead, or use Supabase's `task_id` column
- The `client` field resolution can use `against_id` (now a job ID) → `jobs.company_id` → `companies.name`

#### Critical: `rate_id` Must Be Explicit (Verified 2026-04-13)

When posting activities, Accelo does **not** auto-apply the staff member's default rate.
`rate_charged` defaults to `$0.00`. The timer must explicitly pass `rate_id` when logging time.
Resolution: look up `staff.rate_id` from Supabase, pass it in the POST payload.

#### Gaps

| Field      | Issue                                                                   | Resolution Options                                              |
|------------|-------------------------------------------------------------------------|-----------------------------------------------------------------|
| `category` | Not directly on Activity; must be resolved from the linked Task's type. | Always include task linkage in activity queries. For non-task activities (internal meetings, admin), use `activity_class` or a convention. |
| `client`   | Not directly on Activity; must be resolved from `against_id` or linked task's company. | Always resolve company from the activity's `against` chain.   |

#### Accelo Fields We SHOULD Use But Don't

| Accelo Field                  | Why It's Useful                                              |
|-------------------------------|--------------------------------------------------------------|
| `activity.standing`           | `unapproved` / `approved` / `invoiced` / `locked` -- critical for billing workflow |
| `activity.rate_charged`       | Actual billing rate applied to this entry                    |
| `activity.invoice_id`         | Link time entry to its invoice                               |
| `activity.contract_period_id` | Link to retainer period for budget tracking                  |
| `activity.date_started` / `date_ended` | Precise start/end times for the work session        |
| `activity.visibility`         | Control what clients can see in the portal                   |

---

### 2.6 ClientDocument

**Current UI type** (`src/lib/data.ts`):

```typescript
type ClientDocument = {
  id: string;
  clientName: string;
  name: string;
  category: string;
  fileType: "pdf" | "xlsx" | "docx" | "csv";
  year?: string;
  uploadedAt: string;
  uploadedBy: string;
};
```

#### Field Mapping

| UI Field      | Accelo Source                                                          | Endpoint                          | Transformation                                        |
|---------------|------------------------------------------------------------------------|-----------------------------------|-------------------------------------------------------|
| `id`          | `resource.id`                                                          | `GET /{object_type}/{id}/resources` | Cast to string                                     |
| `clientName`  | Parent company name (resolved from `against_type=company`)             | Resolve from parent object        | Resolve company name from the object the resource is attached to |
| `name`        | `resource.title`                                                       | `GET /{object_type}/{id}/resources` | Direct                                             |
| `category`    | --                                                                     | --                                | **GAP**: Accelo Resources have no category/tag field. See below. |
| `fileType`    | Derived from `resource.title` file extension                           | --                                | Parse extension from filename: `.pdf`, `.xlsx`, etc.  |
| `year`        | --                                                                     | --                                | **GAP**: No native year/period field on Resources.    |
| `uploadedAt`  | Resource creation date (not directly exposed in basic resource listing) | --                                | **GAP**: Accelo's resource endpoint is minimal. May need to check the Activity that created the resource. |
| `uploadedBy`  | Staff who uploaded (not directly on resource)                          | --                                | **GAP**: Must be derived from the Activity or audit log associated with the upload. |

#### Gaps

| Field        | Issue                                                                                      | Resolution Options                                                       |
|--------------|--------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| `category`   | Accelo Resources have `id` and `title` only. No tagging or categorization.                 | 1) Naming convention in `title` (e.g., `[Tax Returns] 2024 Form 1120S`). 2) Use Accelo's object hierarchy: attach resources to Jobs/Tasks of specific types, inheriting category from parent. 3) Folder structure in resource paths. |
| `year`       | No fiscal year / period metadata on Resources.                                              | 1) Parse from filename. 2) Derive from parent object's date range. 3) Naming convention. |
| `uploadedAt` | Resource metadata is sparse; no exposed `date_created` in the standard listing.             | Query the Activity log for the upload action, or use the `date_modified` of the parent object as a proxy. |
| `uploadedBy` | No `staff` / `creator` field on Resources.                                                  | Query the Activity that created the resource attachment.                  |
| `fileType`   | Not a discrete field; must be parsed from filename.                                         | Reliable enough if filenames always include extensions.                   |

#### Overall Assessment

The ClientDocument type has the **worst Accelo coverage** of any UI type. Accelo's
Resources endpoint is deliberately minimal (id + title + upload/download). For a rich
document management experience, consider:

1. Attaching documents to typed Jobs/Tasks to inherit metadata from the parent.
2. Using filename conventions to encode category and year.
3. Supplementing with a lightweight metadata layer (even a JSON custom field on the parent object).

---

### 2.7 Communication

**Current UI type** (`src/lib/data.ts`):

```typescript
type Communication = {
  id: string;
  clientId: string;
  type: "email" | "call" | "text";
  from: string;
  subject: string;
  preview: string;
  date: string;
  read: boolean;
};
```

#### Field Mapping

| UI Field    | Accelo Source                                                          | Endpoint                          | Transformation                                        |
|-------------|------------------------------------------------------------------------|-----------------------------------|-------------------------------------------------------|
| `id`        | `activity.id`                                                          | `GET /activities`                 | Cast to string                                        |
| `clientId`  | `activity.against_id` (when `against_type=company`)                    | `GET /activities`                 | Cast to string                                        |
| `type`      | `activity.medium`                                                      | `GET /activities`                 | Map: `"email"` -> `"email"`, `"call"` -> `"call"`. No `"text"` equivalent. |
| `from`      | `activity.staff.firstname` + `surname` or email sender                 | `GET /activities` (with `_fields=staff`) | For outbound: staff name + " -> " + contact. For inbound: contact name. |
| `subject`   | `activity.subject`                                                     | `GET /activities`                 | Direct                                                |
| `preview`   | `activity.preview_body`                                                | `GET /activities`                 | Direct (Accelo provides pre-truncated preview)        |
| `date`      | `activity.date_created`                                                | `GET /activities`                 | Unix timestamp to ISO 8601 string                     |
| `read`      | --                                                                     | --                                | **GAP**: Accelo has no per-user "read" status on activities. |

#### Gaps

| Field   | Issue                                                                                      | Resolution Options                                                       |
|---------|--------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| `type` = `"text"` | Accelo has no SMS/text medium. Supported mediums: `note`, `email`, `meeting`, `call`, `postal`. | 1) Integrate SMS via a webhook that creates Activities with a custom class. 2) Map to `"note"` with a tag. 3) Accept that SMS is out-of-scope for Accelo and handle via a separate integration. |
| `read`  | Accelo does not track whether a staff member has read an activity.                          | 1) Client-side localStorage (per-user read state keyed by activity ID). 2) Lightweight key-value store. 3) Custom field on Activity (not scalable). |
| `from` direction | Accelo Activities don't cleanly distinguish inbound vs outbound sender in a single field.   | Combine `activity.staff` (internal sender) with `activity.owner_type`/`owner_id` to determine direction. |

#### Accelo Fields We SHOULD Use But Don't

| Accelo Field              | Why It's Useful                                              |
|---------------------------|--------------------------------------------------------------|
| `activity.body` / `html_body` | Full message content for detail view                     |
| `activity.thread_id`     | Group related emails into conversations                      |
| `activity.visibility`    | Distinguish internal vs client-visible communications        |
| `activity.confidential`  | Flag sensitive communications                                |
| `activity.owner_type/id` | True originator (contact vs staff)                           |

---

### 2.8 TimerEntry (Timer Store)

**Current UI type** (`src/lib/timer-store.ts`):

```typescript
type TimerEntry = {
  taskId: string;
  elapsed: number;       // accumulated seconds
  runSince: number | null; // Date.now() when current run began; null = paused
};
```

#### Field Mapping

| UI Field    | Accelo Source                                              | Endpoint                          | Transformation                                        |
|-------------|-------------------------------------------------------------|-----------------------------------|-------------------------------------------------------|
| `taskId`    | `timer.against_id` (when `against_type=task`)               | `GET /timers` (user-scoped)       | Cast to string                                        |
| `elapsed`   | `timer.seconds`                                             | `GET /timers`                     | Direct (both in seconds)                              |
| `runSince`  | Derived from `timer.status`                                 | `GET /timers`                     | If `status=running`, set to current time; if `status=stopped`, set to `null` |

#### Critical Limitation

> **Accelo Timers are user-scoped and NOT available to service (API) apps.**
>
> This means:
> - Server-side code cannot read/write timers on behalf of users.
> - Timer state can only be managed via the Accelo web UI or user-authenticated API calls.
> - The current localStorage approach may actually be the correct architecture for the
>   timer, with a **sync-on-submit** pattern: when the user stops a timer, create an
>   Activity with the elapsed duration.

#### Recommended Architecture

```
localStorage Timer (client) --[stop/submit]--> POST /activities (server)
                                                 { billable: elapsed_seconds,
                                                   against_type: "task",
                                                   against_id: taskId,
                                                   medium: "note",
                                                   subject: "Time logged via Sampson HQ" }
```

This preserves real-time timer UX locally while committing the final time entry to Accelo
as an Activity when the user completes or submits.

#### Gaps

| Field      | Issue                                                                   | Resolution Options                                              |
|------------|-------------------------------------------------------------------------|-----------------------------------------------------------------|
| `runSince` | Accelo Timer only has `running` / `stopped` status, not a precise start timestamp. | Keep `runSince` as client-side state. Accelo sync is for final elapsed values only. |

---

## 3. Proposed Accelo-Native Types

These types reflect Accelo's actual data model. The API layer transforms these into
the UI types documented above. Using Accelo-native shapes internally reduces impedance
mismatch and makes the codebase easier to reason about when consulting Accelo docs.

```typescript
// ── Accelo-native types (API layer) ──────────────────────────────────────────

/** Accelo Staff object */
type AcceloStaff = {
  id: number;
  firstname: string;
  surname: string;
  email: string;
  title: string;          // role / position title
  position: string;
  phone: string | null;
  mobile: string | null;
  standing: "active" | "inactive" | "lockout";
  access_level: number;
  financial_level: number;
  timezone: string;
  // Computed at fetch time, not from Accelo:
  default_rate_id?: number;
};

/** Accelo Company object */
type AcceloCompany = {
  id: number;
  name: string;
  website: string | null;
  phone: string | null;
  standing: "active" | "inactive";
  company_status: number;        // status object ID
  date_created: number;          // unix timestamp
  date_modified: number;
  date_last_interacted: number;
  postal_address: string | null;
  staff_bookmarked: boolean;
  comments: string | null;
  // Custom fields (must be configured in Accelo):
  custom_entity_type?: string;   // "S-Corp" | "LLC" | "C-Corp" | "Partnership"
  custom_industry?: string;      // "Professional Services" | "Real Estate" | etc.
};

/** Accelo Task object */
type AcceloTask = {
  id: number;
  title: string;
  description: string | null;
  assignee: { id: number; firstname: string; surname: string };
  manager: { id: number; firstname: string; surname: string };
  company: { id: number; name: string } | null;
  standing: string;
  task_status: { id: number; title: string; standing: string; ordering: number };
  task_type: { id: number; title: string } | null;
  task_priority: { id: number; title: string; level: number } | null;
  billable: number;              // seconds
  nonbillable: number;           // seconds
  budgeted: number;              // seconds
  logged: number;                // seconds
  remaining: number;             // seconds
  rate_id: number | null;
  rate_charged: number | null;   // $/hr
  date_created: number;          // unix timestamp
  date_started: number | null;
  date_due: number | null;
  date_completed: number | null;
  date_modified: number;
  against_type: string;          // "job" | "company" | etc.
  against_id: number;
  task_job: { id: number; title: string } | null;
  milestone: { id: number; title: string } | null;
  creator_id: number;
  ordering: number;
  // Custom fields:
  custom_recurring?: boolean;
};

/** Accelo Activity object (covers TimeEntry + Communication) */
type AcceloActivity = {
  id: number;
  subject: string;
  body: string | null;
  html_body: string | null;
  preview_body: string | null;
  medium: "note" | "email" | "meeting" | "call" | "postal";
  against_type: string;
  against_id: number;
  owner_type: string;            // "staff" | "contact"
  owner_id: number;
  staff: { id: number; firstname: string; surname: string } | null;
  task: { id: number; title: string } | null;
  billable: number;              // seconds
  nonbillable: number;           // seconds
  rate_charged: number | null;
  standing: "unapproved" | "approved" | "invoiced" | "locked";
  date_created: number;          // unix timestamp
  date_modified: number;
  date_started: number | null;
  date_ended: number | null;
  date_logged: number | null;
  visibility: string;
  confidential: boolean;
  activity_class: { id: number; title: string } | null;
  thread_id: number | null;
  invoice_id: number | null;
  contract_period_id: number | null;
};

/** Accelo Contract (Retainer) object */
type AcceloContract = {
  id: number;
  title: string;
  value: number;                 // monthly/period value
  company: { id: number; name: string };
  manager: { id: number; firstname: string; surname: string };
  standing: string;
  contract_status: number;
  date_started: number;
  date_expires: number | null;
  date_period_expires: number | null;
  auto_renew: boolean;
  job: { id: number; title: string } | null;
};

/** Accelo Contract Period */
type AcceloContractPeriod = {
  id: number;
  date_started: number;
  date_ended: number;
  budget: number;
  allowance: number;             // seconds
  usage: number;                 // seconds consumed
};

/** Accelo Invoice object */
type AcceloInvoice = {
  id: number;
  subject: string;
  invoice_number: string;
  amount: number;
  outstanding: number;
  tax: number;
  date_raised: number;
  date_due: number;
  date_modified: number;
  affiliation_id: number;
  contact: { id: number; firstname: string; surname: string } | null;
};

/** Accelo Resource (file attachment) -- intentionally minimal */
type AcceloResource = {
  id: number;
  title: string;
  // That's it. Accelo's resource model is sparse.
};

/** Accelo Rate object */
type AcceloRate = {
  id: number;
  title: string;
  charged: number;               // $/hr
  standing: string;
};

/** Accelo Object Budget */
type AcceloObjectBudget = {
  id: number;
  against_type: string;
  against_id: number;
  is_billable: boolean;
  service_time_estimate: number; // seconds
  service_time: number;          // seconds
  service_price_estimate: number;
  service_price: number;
  charged_subtotal: number;
  billable_subtotal: number;     // seconds
  nonbillable_subtotal: number;  // seconds
  logged_subtotal: number;       // seconds
  remaining_subtotal: number;
};

/** Accelo Job (Project) object */
type AcceloJob = {
  id: number;
  title: string;
  company: { id: number; name: string };
  manager: { id: number; firstname: string; surname: string };
  standing: string;
  job_status: number;
  job_type: { id: number; title: string } | null;
  date_created: number;
  date_started: number | null;
  date_due: number | null;
  date_completed: number | null;
  date_modified: number;
  date_last_interacted: number;
  rate_charged: number | null;
  affiliation: number | null;
  job_object_budget: AcceloObjectBudget | null;
};
```

---

## 4. Multi-Call Requirements

Several UI views require data assembled from multiple Accelo endpoints. Below is each
scenario, the calls required, and the recommended assembly strategy.

### 4.1 Client Card (Client Detail View)

Assembles the full `Client` type for the client list and detail pages.

| Step | Endpoint                                              | Purpose                               |
|------|-------------------------------------------------------|---------------------------------------|
| 1    | `GET /companies/{id}`                                 | Core company data, `date_last_interacted` |
| 2    | `GET /contracts?company_id={id}&standing=active`      | Active retainer value                  |
| 3    | `GET /invoices?affiliation_company_id={id}`           | Sum `outstanding` for balance          |
| 4    | `GET /jobs?company_id={id}&standing=active`           | Team lead (job manager), services (job types) |
| 5    | `GET /tasks?company_id={id}&standing=open`            | Assigned staff (unique assignees)      |
| 6    | `GET /activities?against_type=company&against_id={id}&_limit=1&_order_by=date_created_desc` | Last contact type |

**Optimization**: Calls 2-6 can run in parallel after call 1. Use `Promise.all()`.

### 4.2 Team Utilization (TeamMember with Hours)

| Step | Endpoint                                              | Purpose                               |
|------|-------------------------------------------------------|---------------------------------------|
| 1    | `GET /staff?standing=active`                          | All active staff                       |
| 2    | `GET /rates`                                          | Billing rates (join by `rate_id`)      |
| 3    | `GET /activities?date_logged_after={period_start}&date_logged_before={period_end}&_fields=staff,billable,nonbillable` | Time data for period |

**Assembly**: Group activities by `staff.id`, sum `billable` and `nonbillable` per staff member.

### 4.3 RichTask Assembly (Manager Dashboard)

| Step | Endpoint                                              | Purpose                               |
|------|-------------------------------------------------------|---------------------------------------|
| 1    | `GET /tasks?standing=open&_fields=assignee,manager,company,task_status,task_type,task_priority` | All open tasks with nested objects |
| 2    | `GET /activities?against_type=task&against_id={id}&_order_by=date_created` (per task, or batched) | History and notes |
| 3    | `GET /activities?date_logged_after={today_start}&date_logged_before={today_end}` | Hours logged today |

**Optimization**: Call 1 returns the full task list. Calls 2-3 can be batched. For history,
consider fetching activities for all visible tasks in one call with filtering:
`GET /activities?against_type=task&against_id_in={id1,id2,...}&medium=note`

### 4.4 Dashboard Firm Stats

| Step | Endpoint                                              | Purpose                               |
|------|-------------------------------------------------------|---------------------------------------|
| 1    | `GET /companies?standing=active&_count`               | `totalClients`, `activeClients`        |
| 2    | `GET /contracts?standing=active`                      | Sum `value` for `monthlyRevenue`       |
| 3    | `GET /invoices?outstanding_greater_than=0`            | Sum `outstanding` for `totalOutstanding` |
| 4    | `GET /tasks?standing=open&_count`                     | `tasksPending`                         |
| 5    | `GET /tasks?date_due_before={next_7_days}&standing=open&_count` | `upcomingDeadlines`           |
| 6    | Activities query (same as 4.2 step 3)                 | `avgUtilization` computation           |

### 4.5 Communication Inbox

| Step | Endpoint                                              | Purpose                               |
|------|-------------------------------------------------------|---------------------------------------|
| 1    | `GET /activities?medium_in=email,call&_order_by=date_created_desc&_limit=50` | Recent communications |
| 2    | Resolve `against_id` to company names (batch)         | Client attribution                    |

### 4.6 Document Vault

| Step | Endpoint                                              | Purpose                               |
|------|-------------------------------------------------------|---------------------------------------|
| 1    | `GET /companies/{id}/resources` (per client)          | Files attached to company              |
| 2    | `GET /jobs/{id}/resources` (per job)                  | Files attached to jobs                 |
| 3    | `GET /tasks/{id}/resources` (per task)                | Files attached to tasks                |

> **Note**: There is no single "list all resources" endpoint. Resources must be fetched
> per-object, making the document vault the most API-intensive view.

---

## 5. Computed Fields

These UI fields have no direct Accelo equivalent and must be derived client-side (or in
the API layer) from raw Accelo data.

### 5.1 TeamMember.utilization

```
utilization = (billableHours / totalHours) * 100
```

Where:
- `billableHours` = sum of `activity.billable` for staff in the period, converted to hours
- `totalHours` = sum of `activity.billable + activity.nonbillable` for staff in the period, converted to hours

If `totalHours` is zero, utilization is 0.

**Period**: Configurable -- typically current month or rolling 30 days.

### 5.2 Client.healthScore

Health score is entirely synthetic. Proposed formula:

```
healthScore = 100
  - (daysSinceLastContact > 14 ? 15 : 0)          // Engagement recency
  - (outstandingBalance > monthlyRetainer ? 10 : 0) // Payment health
  - (overdueTaskCount * 5)                          // Delivery reliability
  - (missedDeadlineCount * 3)                       // Historical reliability
```

**Inputs from Accelo**:
- `company.date_last_interacted` -> days since last contact
- Sum of `invoice.outstanding` -> outstanding balance
- `contract.value` -> monthly retainer for comparison
- Count of `tasks` where `date_due < now AND standing = open` -> overdue tasks

### 5.3 Client.status

```
if (company.standing === "inactive") return "inactive";
if (healthScore < 75) return "at-risk";
if (no active contract AND no open tasks) return "pending";
return "active";
```

### 5.4 TeamMember.avatar

```
avatar = firstname[0] + surname[0]   // e.g., "Gio Rossi" -> "GR"
```

Or for single-name display:
```
avatar = name.substring(0, 2)        // e.g., "Gio" -> "Gi"
```

### 5.5 RichTask.hoursLoggedToday

```
hoursLoggedToday = sum(activities
  .filter(a => a.task.id === taskId && a.date_logged >= todayStart && a.date_logged <= todayEnd)
  .map(a => (a.billable + a.nonbillable) / 3600)
)
```

### 5.6 RichTask.completedToday

```
completedToday = task.date_completed !== null
  && task.date_completed >= todayStart
  && task.date_completed <= todayEnd
```

### 5.7 firmStats.monthlyRevenueTarget

This is a business-configuration value with no Accelo equivalent. Must be stored as:
- An environment variable / config file, or
- A custom field on the Accelo deployment's organization settings.

### 5.8 firmStats.tasksCompleted

```
tasksCompleted = count(tasks where date_completed >= periodStart AND date_completed <= periodEnd)
```

### 5.9 Task.estimatedHours - Task.loggedHours (Remaining)

While the UI computes this, Accelo provides `task.remaining` directly (in seconds).
Prefer using the Accelo value to avoid floating-point drift from independent conversions.

---

## 6. Key Differences Summary Table

| UI Field / Concept                     | Accelo Coverage | Notes                                                                  |
|----------------------------------------|-----------------|------------------------------------------------------------------------|
| **Staff / TeamMember core data**       | Full            | `firstname`, `surname`, `title`, `standing` all available              |
| **Staff billing rate**                 | Full            | Via `rates` endpoint linked to staff                                   |
| **Staff cost rate**                    | None            | No Accelo field. Requires custom field or external config.             |
| **Company / Client core data**         | Full            | `name`, `standing`, `date_last_interacted` all available               |
| **Company entity type**                | None            | Custom field required                                                  |
| **Company industry**                   | None            | Custom field required                                                  |
| **Client health score**                | Computed        | Derived from multiple Accelo signals; no native field                  |
| **Client status (at-risk/pending)**    | Computed        | Derived from health score + standing                                   |
| **Monthly retainer value**             | Full            | `contract.value` on active contracts                                   |
| **Outstanding balance**                | Full            | Sum of `invoice.outstanding`                                           |
| **Last contact type**                  | Partial         | `activity.medium` covers email/call but NOT SMS/text                   |
| **Task core data**                     | Full            | `title`, `assignee`, `company`, `date_due`, `budgeted`, `logged`       |
| **Task status mapping**                | Config-dependent| Must map Accelo `task_status` titles to UI's 4-stage enum              |
| **Task priority mapping**              | Config-dependent| Must map Accelo `task_priority` levels to high/medium/low              |
| **Task recurring flag**                | None            | Custom field or external scheduling required                           |
| **RichTask stage pipeline**            | Config-dependent| Requires custom task statuses in Accelo (waiting/progress/review/bill) |
| **RichTask dependencies**              | None            | No native task dependency model in Accelo                              |
| **RichTask stage history**             | Partial         | Activity log is a proxy but not a guaranteed status-transition log     |
| **Time entry / Activity**              | Full            | Activities with `billable`/`nonbillable` > 0 are time entries          |
| **Time entry billable flag**           | Full            | Derived from `billable > 0`                                            |
| **Time entry approval status**         | Full (unused)   | `activity.standing` provides unapproved/approved/invoiced/locked       |
| **Communication (email/call)**         | Full            | Activities with `medium=email` or `medium=call`                        |
| **Communication (text/SMS)**           | None            | No SMS medium in Accelo                                                |
| **Communication read status**          | None            | Accelo has no per-user read tracking                                   |
| **Document / Resource core**           | Minimal         | Only `id` and `title` available; no category, date, uploader           |
| **Document category**                  | None            | Must derive from parent object type or naming convention               |
| **Document metadata (date, uploader)** | None            | Must derive from associated Activity                                   |
| **Timer (live clock)**                 | Partial         | Accelo Timers exist but are user-scoped only, not API-accessible for service apps |
| **Firm stats / KPIs**                  | Computed        | Aggregated from multiple endpoints                                     |
| **Revenue target**                     | None            | Business config, not in Accelo                                         |

### Priority Action Items

1. **Configure custom fields in Accelo** for: `entityType`, `industry` (on Company), `recurring` (on Task), and optionally `cost_rate` (on Staff).
2. **Configure task statuses** in Accelo to match the UI's stage pipeline: `waiting-on-client`, `in-progress`, `in-review`, `ready-to-bill`, plus `todo` and `done`.
3. **Establish a document metadata strategy** -- naming conventions, parent-object inheritance, or Activity-based metadata resolution.
4. **Decide on the SMS/text gap** -- integrate via webhook + custom Activity, or remove from UI.
5. **Implement read-status tracking** -- localStorage per-user is the pragmatic path given Accelo's limitations.
6. **Build the health score computation** with clearly documented weights and Accelo input signals.
7. **Design the timer sync pattern** -- localStorage for real-time UX, Activity creation on stop/submit.
