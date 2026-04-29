# Staff, Rates & Cost Data

## Active Staff Roster

| ID | Name | Role | Billing Rate ID | Internal Cost Rate |
|----|------|------|-----------------|--------------------|
| 2 | Henry Fiorillo | CEO | 22 ($100/hr) | $150/hr |
| 5 | Mitchell Langsam | Sr PG Specialist | 18 ($45/hr) | $60/hr |
| 7 | Donna Fiorillo | VP Admin | 24 ($11/hr) | $50/hr |
| 11 | Jordea Fernandez | Admin Asst | 24 ($11/hr) | $25/hr |
| 12 | Jim Tall | CFO | 22 ($100/hr) | $175/hr |
| 13 | Giordanys Plasencia | Jr PG Specialist | 19 ($35/hr) | $40/hr |
| 14 | Patrick Moloney | Sr PG Specialist | 18 ($45/hr) | $60/hr |
| 24 | Mark Young | COO | 22 ($100/hr) | $125/hr |
| 29 | Musa Shahbaz | — | 19 ($35/hr) | $35/hr |
| 32 | Henry Fiorillo III | — | 19 ($35/hr) | $35/hr |
| 33 | Muhammad Faizan | — | 19 ($35/hr) | $35/hr |
| 34 | Samantha Speirs | — | 19 ($35/hr) | $35/hr |
| 36 | Alex Klepadlo | — | 19 ($35/hr) | $35/hr |
| 37 | Daohao Li | — | 19 ($35/hr) | $35/hr |
| 38 | Umer Saif | — | 19 ($35/hr) | $35/hr |

Default for unknown staff: Billing Rate 19 ($35/hr), Internal Cost $35/hr.

## Accelo Billing Rates

### Active
| Rate ID | Title | Hourly Rate |
|---------|-------|-------------|
| 18 | Sr. Profit and Growth Accountants | $45.00 |
| 19 | Jr. Profit and Growth Accountant | $35.00 |
| 22 | Executive Leadership | $100.00 |
| 24 | Admin | $11.00 |

### Inactive (historical reference only)
| Rate ID | Title | Hourly Rate |
|---------|-------|-------------|
| 6 | CFO | $300.00 |
| 17 | Partner | $500.00 |
| 7 | Sr. Profit and Growth Accountant | $100.00 |
| 15 | Senior Analyst | $200.00 |
| 13 | Junior Professional | $30.00 |
| 14 | Base | $100.00 |
| 23 | NYBDC | $125.00 |
| 26 | DEFAULT non billable rate | $0.00 |

## Role → Rate Mapping

| Role | Billing Rate ID |
|------|-----------------|
| CEO, CFO, COO | 22 (Executive, $100/hr) |
| Sr PG Specialist | 18 ($45/hr) |
| Jr PG Specialist | 19 ($35/hr) |
| VP Admin, Admin Asst | 24 ($11/hr) |
| Default (no role) | 19 ($35/hr) |

## Task Statuses

| Status ID | Title | Standing |
|-----------|-------|----------|
| 2 | Pending | pending |
| 3 | Accepted | accepted |
| 4 | Started | started |
| 5 | Complete | complete |
| 6 | Inactive | inactive |
| 7 | Paused | paused |

No "active" standing exists. Open work = standing NOT IN (complete, inactive).

## Custom Terminology

| Accelo Term | Sampson Display Label |
|-------------|----------------------|
| Jobs | Projects |
| Companies | Clients |
| Issues | Cases |
| Contracts | Retainers |
| Prospects | Sales |
| Bookmarks | Favorites |

Always use Sampson terminology in report output.

## Environment Variables

```
ACCELO_CLIENT_ID     — e.g. ecf74bcba5@sampsonllc.accelo.com
ACCELO_CLIENT_SECRET — stored securely, never log
ACCELO_DEPLOYMENT    — sampsonllc (derivable from client_id)
```

## Key Entity Counts (as of 2026-04-12)

| Entity | Total | Active/Open |
|--------|-------|-------------|
| Activities | 327,390 | — |
| Tasks | 29,964 | many (paused = running) |
| Invoices | 5,467 | — |
| Companies | 1,166 | 602 |
| Jobs | 2,139 | 212 |
| Issues | 2,561 | 74 |
| Contracts | 98 | 34 |
| Staff | 38 | 16 |
