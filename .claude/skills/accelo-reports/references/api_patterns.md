# Accelo API Patterns & Gotchas

## Base URL

```
https://sampsonllc.api.accelo.com/api/v0/
```

## Authentication

OAuth2 `client_credentials` grant. Token endpoint:

```
POST https://sampsonllc.api.accelo.com/oauth2/v0/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={ACCELO_CLIENT_ID}&client_secret={ACCELO_CLIENT_SECRET}
```

Token lasts 30 days. No refresh token — just re-request. Authenticated as Daohao Li (id: 37), admin access.

## Pagination

- `_page=0` (0-indexed), `_limit=100` (max per page)
- Always paginate. Check `response.meta.more` or compare returned count vs `_limit`.
- Loop: increment `_page` until fewer than `_limit` results returned.

```bash
# Pattern: fetch all pages
page=0
while true; do
  result=$(curl -s "$BASE/tasks?_limit=100&_page=$page&..." -H "Authorization: Bearer $TOKEN")
  # process result
  count=$(echo "$result" | jq '.response | length')
  [ "$count" -lt 100 ] && break
  page=$((page + 1))
done
```

## Field Selection

- `_fields=id,title,assignee,company` — selective fetch (reduces payload)
- `_fields=_ALL` — all fields including optional
- Nested: `_fields=company(name),assignee(firstname,surname)`
- Always use `_fields` to minimize payload and API processing time

## Filtering

- Basic: `_filters=field(value1,value2)`
- Date: `date_field_before(unix_ts)`, `date_field_after(unix_ts)`
- Range: `field_greater_than(val)`, `field_less_than(val)`
- Logic: `_OR(filter1,filter2)`, `_AND(filter1,filter2)`
- Negation: append `_not` — e.g. `standing_not(complete)`
- Search: `_search=term1+term2` (AND across designated fields)
- Empty: `empty(field_name)` for null values
- Combine: `_filters=assignee(5),standing_not(complete),date_due_before(1714000000)`

## Rate Limits

- **5,000 requests/hour** per deployment
- Monitor: `X-RateLimit-Remaining` and `X-RateLimit-Reset` response headers
- Auth endpoints (`/oauth2`) are unlimited and don't count
- Budget estimate for full report suite: ~200-500 calls depending on scope

## Critical Gotchas

### against_type is SINGULAR for POSTs
POST/PUT use singular: `task`, `job`, `company`. NOT `tasks`, `jobs`, `companies`. Plural form returns `invalid_request`.

### Activities are re-parented
Activities POSTed against a task are re-parented to the parent job in Accelo's response (`against_type=job, against_id={job_id}`). The original task link is preserved in the nested `task` field. Query per-task activities using `_filters=task_id({id})` or `_fields=task(id)`.

### rate_id must be explicit
When creating activities, `rate_charged` defaults to `$0.00` if `rate_id` is not specified. Always pass `rate_id` explicitly.

### owner_id impersonation works
Service app token (Daohao, id:37) can log time as any staff member via `owner_id`. Verified 2026-04-13.

### Task standings — no "active"
Valid standings: `pending`, `accepted`, `started`, `complete`, `inactive`, `paused`. There is NO `active` standing. To get open tasks use: `standing_not(complete),standing_not(inactive)`.

### All timestamps are Unix epoch seconds
`date_due`, `date_created`, `date_started`, `date_completed`, `date_last_interacted` are all Unix epoch seconds. Convert to/from human-readable dates as needed.

### Date-window large datasets
Activities table has 327K+ records. ALWAYS use `date_started_after()` and `date_started_before()` filters. Never fetch unscoped activity lists.

## Key Endpoints Quick Reference

| Resource | Endpoint | Notes |
|----------|----------|-------|
| Activities | `GET /activities` | Time entries. 327K records — always date-filter |
| Tasks | `GET /tasks` | 30K records. Filter by assignee, standing, company |
| Jobs (Projects) | `GET /jobs` | 2.1K records. Include `job_object_budget` for financials |
| Companies (Clients) | `GET /companies` | 1.2K records, 602 active |
| Invoices | `GET /invoices` | 5.4K records |
| Contracts (Retainers) | `GET /contracts` | 98 total, 34 active |
| Contract Periods | `GET /contracts/{id}/periods` | Per-period budget/usage |
| Object Budgets | `GET /object_budgets` | Auto-aggregated project financials |
| Staff | `GET /staff` | 38 total, 16 active |
| Rates | `GET /rates` | Billing rate tiers |

## Webhooks (limited coverage)

Available: `create_task`, `assign_task`, `create_invoice`, `update_invoice`, `create_company`, `update_company`, `create_contact`, `update_contact`, `create_issue`, `update_issue`, `create_sale`, `update_sale`.

NOT available: activity creation, task completion, task status change, time logging. These require polling.
