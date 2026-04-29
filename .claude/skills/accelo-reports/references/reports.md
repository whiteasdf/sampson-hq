# Report Specifications

## Table of Contents
1. [WIP Report](#1-wip-report)
2. [Project Profitability](#2-project-profitability)
3. [Retainer Utilization](#3-retainer-utilization)
4. [Team Utilization](#4-team-utilization)
5. [Overdue Tasks](#5-overdue-tasks)
6. [Client Health Scorecard](#6-client-health-scorecard)
7. [Staff Workload Balance](#7-staff-workload-balance)

---

## 1. WIP Report

Work-In-Progress: unbilled time representing earned-but-not-invoiced revenue. The single most important financial metric for professional service firms.

### Dual-Method Calculation

Run BOTH methods and reconcile.

**Method A — Activity Standing Filter (primary)**

Fetch activities not yet invoiced:

```
GET /api/v0/activities
  ?_filters=_OR(standing(unapproved),standing(approved)),date_started_after({period_start})
  &_fields=id,subject,billable,nonbillable,rate_charged,owner_id,against_type,against_id,task(id,title),standing,date_started
  &_limit=100&_page=0
```

Paginate through all pages. For each activity:
- `unbilled_hours = billable / 3600`
- `unbilled_revenue = unbilled_hours × rate_charged`

Group by: client (via task → job → company chain), staff (owner_id), service line (job type).

**Method B — Invoice Gap Analysis**

Per client, compare total logged billable time against total invoiced amounts:
1. Fetch tasks per company: `GET /api/v0/tasks?_filters=against_type(company),against_id({id})&_fields=id,billable,logged`
2. Fetch invoices per company: `GET /api/v0/invoices?_filters=against_type(company),against_id({id})&_fields=id,amount,outstanding`
3. Gap = sum(task.billable/3600 × effective_rate) - sum(invoice.amount - invoice.outstanding)

**Reconciliation:** flag clients where Method A and Method B differ by more than 10%. Common causes: activities approved but no invoice created, or invoices raised for fixed-fee work without matching activities.

### Output Columns

| Client | Staff | Unbilled Hours | Unbilled Revenue | Standing | Oldest Entry |
|--------|-------|---------------|-----------------|----------|-------------|

Summary row: firm-wide total unbilled hours and revenue.

---

## 2. Project Profitability

Two views: budget performance and true margin.

### Budget View

Fetch active jobs with Object Budgets:

```
GET /api/v0/jobs
  ?_filters=standing(active)
  &_fields=id,title,company(id,name),manager(id,firstname,surname),standing,date_started,date_due,job_object_budget(charged_subtotal,billable_subtotal,nonbillable_subtotal,service_time_estimate,service_time,service_price_estimate,service_price,remaining_subtotal,expense_price,material_cost_subtotal)
  &_limit=100&_page=0
```

Per project:
- `budget_burn = service_time / service_time_estimate` (1.0 = on budget)
- `revenue_efficiency = service_price / service_price_estimate`
- `effective_hourly_rate = charged_subtotal / (billable_subtotal / 3600)`

### True Margin View

Requires staff cost rates from lookups.md. Per project:
1. Fetch activities for the job: `GET /api/v0/activities?_filters=against_type(job),against_id({job_id})&_fields=owner_id,billable`
2. For each activity: `cost = (billable / 3600) × staff_cost_rate[owner_id]`
3. `true_margin = (charged_subtotal - total_cost) / charged_subtotal`

### Benchmarks

Include firm-wide averages for: budget burn, effective hourly rate, true margin. Flag projects more than 20% below average margin.

### Output Columns

| Project | Client | Manager | Budget Burn | Revenue | Cost | True Margin | Eff. Rate | Status |
|---------|--------|---------|-------------|---------|------|------------|-----------|--------|

---

## 3. Retainer Utilization

Track contract period usage vs allowance.

### Data Fetching

```
GET /api/v0/contracts?_filters=standing(active)
  &_fields=id,title,company(id,name),standing,value,date_expires
  &_limit=100
```

For each contract, fetch recent periods:

```
GET /api/v0/contracts/{id}/periods
  &_fields=id,budget,allowance,usage,date_commenced,date_expires
  &_limit=10
```

### Metrics

Per contract period:
- `utilization_pct = usage / allowance × 100`
- Flag: `< 50%` = under-utilized (revenue risk — client may not renew)
- Flag: `> 90%` = over-utilized (scope creep — need to upsell or enforce boundaries)
- Trend: compare current period utilization vs previous 2 periods

### Output Columns

| Client | Retainer | Period | Allowance | Used | Utilization % | Trend | Flag |
|--------|----------|--------|-----------|------|--------------|-------|------|

---

## 4. Team Utilization

Billable vs non-billable hours per staff member.

### Data Fetching

```
GET /api/v0/activities
  ?_filters=date_started_after({period_start}),date_started_before({period_end}),owner_type(staff)
  &_fields=owner_id,billable,nonbillable,rate_charged
  &_limit=100&_page=0
```

Paginate all pages. Aggregate per owner_id.

### Metrics

Per staff member:
- `billable_hours = sum(billable) / 3600`
- `nonbillable_hours = sum(nonbillable) / 3600`
- `total_hours = billable_hours + nonbillable_hours`
- `utilization_rate = billable_hours / total_hours × 100`
- `revenue = sum(rate_charged × (billable / 3600))` per activity
- Target benchmark: **65-80%** for accounting firms

Firm-wide:
- `firm_avg_utilization = sum(all_billable) / sum(all_total) × 100`
- Include firm average as benchmark on every row

### Output Columns

| Staff | Billable Hrs | Non-Bill Hrs | Total Hrs | Utilization % | vs Firm Avg | Revenue |
|-------|-------------|-------------|-----------|--------------|-------------|---------|

---

## 5. Overdue Tasks

All incomplete tasks past their due date.

### Data Fetching

```
GET /api/v0/tasks
  ?_filters=date_due_before({now_unix}),standing_not(complete),standing_not(inactive)
  &_fields=id,title,date_due,date_created,assignee(id,firstname,surname),manager(id,firstname,surname),company(id,name),task_job(id,title),task_priority,standing,task_status
  &_limit=100&_page=0
  &order_by_asc=date_due
```

### Metrics

Per task:
- `days_overdue = (now - date_due) / 86400`
- Severity: **Critical** if > 14 days overdue, **Warning** if 1-14 days

Group by client first, then by assignee within each client.

Include: total overdue count, breakdown by severity, top 3 clients by overdue count.

### Output Columns

| Severity | Task | Client | Project | Assignee | Due Date | Days Overdue | Priority |
|----------|------|--------|---------|----------|----------|-------------|----------|

---

## 6. Client Health Scorecard

Composite 0-100 score per client across 4 equally weighted dimensions (25% each).

### Data Fetching Per Client

For each active company:
1. Company: `GET /api/v0/companies/{id}?_fields=id,name,date_last_interacted,standing`
2. Invoices: `GET /api/v0/invoices?_filters=against_type(company),against_id({id})&_fields=id,amount,outstanding,date_raised,date_due&_limit=50`
3. Tasks (90-day window): `GET /api/v0/tasks?_filters=against_type(company),against_id({id}),date_created_after({90_days_ago})&_fields=id,standing,date_due,date_completed&_limit=100`
4. Contracts: `GET /api/v0/contracts?_filters=company_id({id}),standing(active)&_fields=id,title&_limit=10` → then fetch periods for each

**Rate limit note:** for 602 clients this would be ~2,400 calls. Limit to top 50 clients by revenue or active project count unless user requests full sweep. Ask user for scope.

### Scoring (each dimension 0-25 points)

**Interaction Recency (25%)**
- `days_since = (now - date_last_interacted) / 86400`
- Score: 25 if ≤ 7 days, 20 if ≤ 14, 15 if ≤ 30, 10 if ≤ 60, 5 if ≤ 90, 0 if > 90

**Invoice Payment Speed (25%)**
- For paid invoices: `avg_days_to_pay = mean(date_paid - date_raised)` across recent invoices
- For unpaid: factor in `outstanding / amount` ratio and aging
- Score: 25 if avg ≤ 15 days, 20 if ≤ 30, 15 if ≤ 45, 10 if ≤ 60, 5 if ≤ 90, 0 if > 90
- Deduct up to 10 points for high outstanding balance relative to client average

**Task Completion (25%)**
- `completion_rate = completed_tasks / total_tasks` in 90-day window
- `overdue_rate = overdue_tasks / total_tasks`
- Score: 25 × completion_rate - (10 × overdue_rate), floor at 0

**Retainer Health (25%)**
- If client has active retainer: score based on utilization (50-90% = 25, under 50% = 15, over 90% = 15, no usage = 5)
- If no retainer: score = 15 (neutral — doesn't penalize non-retainer clients)

### Thresholds

- **Healthy**: 70-100
- **At Risk**: 40-69
- **Critical**: 0-39

### Output Columns

| Client | Interaction | Invoices | Tasks | Retainer | Total Score | Status |
|--------|------------|----------|-------|----------|------------|--------|

---

## 7. Staff Workload Balance

Open task distribution across the team.

### Data Fetching

Per active staff member (see lookups.md for roster):

```
GET /api/v0/tasks
  ?_filters=assignee({staff_id}),standing_not(complete),standing_not(inactive)
  &_fields=id,title,remaining,task_priority,date_due,company(id,name),standing
  &_limit=100&_page=0
```

### Metrics

Per staff member:
- `open_task_count` = total tasks returned
- `remaining_hours = sum(remaining) / 3600` (estimated hours left)
- Priority distribution: count by priority level
- Overdue count: tasks where `date_due < now`

Team-wide:
- `mean_tasks = sum(all_open_tasks) / active_staff_count`
- `median_tasks` = median of all staff task counts
- Flag anyone with `open_task_count > 1.5 × mean_tasks` as overloaded
- Flag anyone with `open_task_count < 0.5 × mean_tasks` as underloaded

### Output Columns

| Staff | Open Tasks | vs Mean | Remaining Hrs | High Priority | Overdue | Flag |
|-------|-----------|---------|--------------|--------------|---------|------|
