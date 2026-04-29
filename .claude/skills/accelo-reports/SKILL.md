---
name: accelo-reports
description: Generate management reports from the Accelo API for Sampson LLC (accounting firm). Supports 7 report types — WIP, Project Profitability, Retainer Utilization, Team Utilization, Overdue Tasks, Client Health Scorecard, Staff Workload Balance. Use when the user asks for any accounting/professional-services report, utilization analysis, profitability review, WIP report, client health check, workload balance, overdue task summary, retainer burn analysis, or any Accelo data query. Also use when the user asks to "pull numbers from Accelo", "generate a report", "check utilization", "how's the team doing", "what's our WIP", or similar.
---

# Accelo Management Reports

Generate financial and operational reports for Sampson LLC by querying the Accelo API directly.

## Workflow

1. **Authenticate** — obtain OAuth2 bearer token
2. **Determine report type** — match user request to one of the 7 reports
3. **Determine scope** — full firm, specific staff, specific client, or specific project
4. **Determine period** — weekly, monthly, custom date range, or trailing window
5. **Fetch data** — paginated API calls with date-windowed filters
6. **Compute metrics** — apply formulas from the report spec
7. **Format output** — markdown tables with executive summary and benchmarks

## Step 1: Authentication

Read `ACCELO_CLIENT_ID` and `ACCELO_CLIENT_SECRET` from environment. Request a token:

```bash
curl -s -X POST https://sampsonllc.api.accelo.com/oauth2/v0/token \
  -d "grant_type=client_credentials" \
  -d "client_id=$ACCELO_CLIENT_ID" \
  -d "client_secret=$ACCELO_CLIENT_SECRET"
```

Response: `{ "access_token": "...", "token_type": "bearer", "expires_in": 2592000 }`. Use `Authorization: Bearer {token}` on all subsequent requests. If env vars are missing, ask the user.

## Step 2: Report Dispatch

| User says | Report | Reference section |
|-----------|--------|-------------------|
| WIP, unbilled time, work in progress | WIP Report | reports.md §1 |
| profitability, margin, budget burn | Project Profitability | reports.md §2 |
| retainer, contract, allowance, burn | Retainer Utilization | reports.md §3 |
| utilization, billable hours, capacity | Team Utilization | reports.md §4 |
| overdue, past due, deadline, late tasks | Overdue Tasks | reports.md §5 |
| client health, at risk, scorecard | Client Health Scorecard | reports.md §6 |
| workload, balance, distribution, capacity | Staff Workload Balance | reports.md §7 |

For full report specs, formulas, and API call patterns: read [references/reports.md](references/reports.md).

## Step 3: Scope & Period

**Scope modifiers** — apply entity filters when user specifies:
- Staff: `_filters=assignee({staff_id})` or `owner_id({staff_id})` — look up ID in [references/lookups.md](references/lookups.md)
- Client: `_filters=against_type(company),against_id({company_id})` — search companies first if name given
- Project: `_filters=child_of_job({job_id})` — search jobs first if title given
- Manager's team: fetch all tasks where `manager_id={staff_id}`

**Period defaults:**
- Weekly reports: Monday 00:00 → Sunday 23:59 of current week (Unix timestamps)
- Monthly reports: 1st of month 00:00 → last day 23:59
- On-demand: ask user or default to trailing 30 days
- Always convert dates to Unix epoch seconds for API filters

## Step 4: Fetching Data

Read [references/api_patterns.md](references/api_patterns.md) for pagination, field selection, filter syntax, and rate limits.

**Critical:** for large datasets (activities = 327K records), ALWAYS scope queries with date filters. Never fetch unscoped activity lists.

## Step 5: Output Format

### Manager View (default)

```
# {Report Name}
**Report Period:** {start_date} to {end_date} | **Generated:** {now}

## Executive Summary
{2-3 sentence overview with key numbers and alerts}

## {Main data tables}

## Benchmarks
- Firm average: {metric}
- {Entity} vs average: {comparison}

## Alerts
- {Items requiring attention, flagged by severity}
```

### C-Suite View (when user requests "executive summary" or "for Henry/Jim/Mark")

Omit task-level detail. Show only KPIs, period-over-period trends, and alerts in a 1-page summary.

## References

- **Report specs & formulas**: [references/reports.md](references/reports.md)
- **API patterns & gotchas**: [references/api_patterns.md](references/api_patterns.md)
- **Staff, rates & cost data**: [references/lookups.md](references/lookups.md)
