/**
 * Unit tests for analytics computation logic.
 *
 * The weekly aggregation and utilization formulas live in
 * src/app/api/cron/compute-analytics/route.ts.  Since that module
 * initialises Supabase at import time (top-level createClient calls), we
 * isolate and re-implement only the pure computation helpers here.
 *
 * Tested computations:
 *   - Weekly period boundary calculation (Monday–Sunday, any day of week)
 *   - Per-staff aggregation of seconds and revenue
 *   - Utilization % = (totalHours / standardHours) * 100, rounded to 2dp
 *   - Margin = revenue - cost
 *   - billable_hrs rounded to 2dp
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Pure helpers extracted from compute-analytics/route.ts ───────────────────

/** Returns the Monday-start of the current week as a Date (midnight local). */
function getWeekStart(now: Date): Date {
  const ws = new Date(now);
  ws.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  ws.setHours(0, 0, 0, 0);
  return ws;
}

/** Returns the Sunday-end of the week that started on weekStart. */
function getWeekEnd(weekStart: Date): Date {
  const we = new Date(weekStart);
  we.setDate(weekStart.getDate() + 6);
  we.setHours(23, 59, 59, 999);
  return we;
}

type ActivityRow = {
  staff_id: number;
  duration_seconds: number;
  rate_id: number | null;
};

type StaffAggregate = {
  totalSeconds: number;
  revenue: number;
};

/** Aggregates activities by staff, computing total seconds and revenue. */
function aggregateByStaff(
  activities: ActivityRow[],
  rateMap: Map<number, number>
): Map<number, StaffAggregate> {
  const result = new Map<number, StaffAggregate>();

  for (const a of activities) {
    if (!a.staff_id) continue;
    const existing = result.get(a.staff_id) ?? { totalSeconds: 0, revenue: 0 };
    const seconds = a.duration_seconds ?? 0;
    const hours = seconds / 3600;
    const billingRate = a.rate_id ? (rateMap.get(a.rate_id) ?? 0) : 0;

    existing.totalSeconds += seconds;
    existing.revenue += hours * billingRate;
    result.set(a.staff_id, existing);
  }

  return result;
}

/** Computes a single analytics snapshot row for one staff member. */
function buildWeeklyRow(
  staffId: number,
  data: StaffAggregate,
  costRate: number,
  standardHrs: number,
  tasksCompleted: number,
  periodStart: string,
  periodEnd: string
) {
  const totalHrs = data.totalSeconds / 3600;
  const cost = totalHrs * costRate;

  return {
    period_start: periodStart,
    period_end: periodEnd,
    period_type: "week",
    staff_id: staffId,
    billable_hrs: Math.round(totalHrs * 100) / 100,
    nonbillable_hrs: 0,
    utilization:
      standardHrs > 0
        ? Math.round((totalHrs / standardHrs) * 10000) / 100
        : 0,
    revenue: Math.round(data.revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    margin: Math.round((data.revenue - cost) * 100) / 100,
    tasks_completed: tasksCompleted,
  };
}

// ── Week boundary calculation ─────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD using local time (avoids UTC drift from toISOString). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("getWeekStart() — Monday-anchored week start", () => {
  it("returns Monday itself when today is Monday", () => {
    // 2024-01-08 is a Monday
    const monday = new Date("2024-01-08T14:00:00");
    const ws = getWeekStart(monday);
    expect(localDateStr(ws)).toBe("2024-01-08");
    expect(ws.getDay()).toBe(1); // 1 = Monday
  });

  it("returns the previous Monday when today is Sunday", () => {
    // 2024-01-14 is a Sunday → week start should be 2024-01-08
    const sunday = new Date("2024-01-14T10:00:00");
    const ws = getWeekStart(sunday);
    expect(localDateStr(ws)).toBe("2024-01-08");
  });

  it("returns the previous Monday when today is Wednesday", () => {
    // 2024-01-10 is a Wednesday → week start is 2024-01-08
    const wednesday = new Date("2024-01-10T08:00:00");
    const ws = getWeekStart(wednesday);
    expect(localDateStr(ws)).toBe("2024-01-08");
  });

  it("returns midnight (00:00:00) for the week start", () => {
    const someDay = new Date("2024-01-10T15:30:00");
    const ws = getWeekStart(someDay);
    expect(ws.getHours()).toBe(0);
    expect(ws.getMinutes()).toBe(0);
    expect(ws.getSeconds()).toBe(0);
  });

  it("week end is exactly 6 days after week start", () => {
    const monday = new Date("2024-01-08T00:00:00");
    const ws = getWeekStart(monday);
    const we = getWeekEnd(ws);
    const diffDays = (we.getTime() - ws.getTime()) / 86400000;
    // 6 days + 23:59:59.999 ≈ 6.9999...  — check it spans 6 full days
    expect(Math.floor(diffDays)).toBe(6);
  });

  it("week end falls on a Sunday", () => {
    const monday = new Date("2024-01-08T00:00:00");
    const ws = getWeekStart(monday);
    const we = getWeekEnd(ws);
    expect(we.getDay()).toBe(0); // 0 = Sunday
    expect(localDateStr(we)).toBe("2024-01-14");
  });
});

// ── aggregateByStaff ──────────────────────────────────────────────────────────

describe("aggregateByStaff()", () => {
  const rateMap = new Map([
    [10, 150], // rate id 10 → $150/hr
    [20, 200], // rate id 20 → $200/hr
  ]);

  it("returns an empty map when activities array is empty", () => {
    expect(aggregateByStaff([], rateMap).size).toBe(0);
  });

  it("sums seconds and revenue for a single staff member", () => {
    const activities: ActivityRow[] = [
      { staff_id: 1, duration_seconds: 3600, rate_id: 10 }, // 1h @ $150 = $150
    ];
    const result = aggregateByStaff(activities, rateMap);
    expect(result.get(1)).toEqual({ totalSeconds: 3600, revenue: 150 });
  });

  it("accumulates multiple entries for the same staff member", () => {
    const activities: ActivityRow[] = [
      { staff_id: 1, duration_seconds: 3600, rate_id: 10 }, // 1h @ $150
      { staff_id: 1, duration_seconds: 1800, rate_id: 10 }, // 0.5h @ $150 = $75
    ];
    const result = aggregateByStaff(activities, rateMap);
    expect(result.get(1)).toEqual({ totalSeconds: 5400, revenue: 225 });
  });

  it("separates totals for different staff members", () => {
    const activities: ActivityRow[] = [
      { staff_id: 1, duration_seconds: 3600, rate_id: 10 }, // $150
      { staff_id: 2, duration_seconds: 3600, rate_id: 20 }, // $200
    ];
    const result = aggregateByStaff(activities, rateMap);
    expect(result.get(1)!.revenue).toBe(150);
    expect(result.get(2)!.revenue).toBe(200);
  });

  it("uses revenue=0 when rate_id is null", () => {
    const activities: ActivityRow[] = [
      { staff_id: 1, duration_seconds: 7200, rate_id: null },
    ];
    const result = aggregateByStaff(activities, rateMap);
    expect(result.get(1)).toEqual({ totalSeconds: 7200, revenue: 0 });
  });

  it("uses revenue=0 when rate_id is not in the rate map", () => {
    const activities: ActivityRow[] = [
      { staff_id: 1, duration_seconds: 3600, rate_id: 999 }, // unknown rate
    ];
    const result = aggregateByStaff(activities, rateMap);
    expect(result.get(1)!.revenue).toBe(0);
  });

  it("treats duration_seconds=0 as zero time (no division issues)", () => {
    const activities: ActivityRow[] = [
      { staff_id: 1, duration_seconds: 0, rate_id: 10 },
    ];
    const result = aggregateByStaff(activities, rateMap);
    expect(result.get(1)).toEqual({ totalSeconds: 0, revenue: 0 });
  });
});

// ── buildWeeklyRow / utilization ──────────────────────────────────────────────

describe("buildWeeklyRow() — utilization and financial calculations", () => {
  const PERIOD_START = "2024-01-08";
  const PERIOD_END = "2024-01-14";
  const STANDARD_HRS = 40;

  it("computes utilization as (totalHours / standardHours) * 100, rounded to 2dp", () => {
    // 20 hours billed out of 40-hr week = 50.00%
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 72_000, revenue: 0 }, // 20 hours
      0,
      STANDARD_HRS,
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.utilization).toBe(50);
  });

  it("computes fractional utilization rounded to 2 decimal places", () => {
    // 30 hours / 40 = 75.00%
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 108_000, revenue: 0 }, // 30 hours
      0,
      STANDARD_HRS,
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.utilization).toBe(75);
  });

  it("returns utilization=0 when standardHrs is 0 (prevents division by zero)", () => {
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 3600, revenue: 100 },
      50,
      0, // standardHrs = 0 → should not divide
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.utilization).toBe(0);
  });

  it("can produce utilization > 100 when staff logs more than standard hours", () => {
    // 50 hours / 40 = 125%
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 180_000, revenue: 0 }, // 50 hours
      0,
      STANDARD_HRS,
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.utilization).toBe(125);
  });

  it("computes cost = totalHours * costRate, rounded to 2dp", () => {
    // 10 hrs * $80/hr cost = $800
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 36_000, revenue: 0 }, // 10 hours
      80, // cost rate
      STANDARD_HRS,
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.cost).toBe(800);
  });

  it("computes margin = revenue - cost, rounded to 2dp", () => {
    // 10 hrs * $150 revenue, 10 hrs * $80 cost → margin = $700
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 36_000, revenue: 1500 },
      80,
      STANDARD_HRS,
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.revenue).toBe(1500);
    expect(row.cost).toBe(800);
    expect(row.margin).toBe(700);
  });

  it("allows negative margin when cost exceeds revenue", () => {
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 36_000, revenue: 500 },
      100, // $100/hr cost → $1000 cost
      STANDARD_HRS,
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.margin).toBe(-500);
  });

  it("rounds billable_hrs to 2 decimal places", () => {
    // 3660 seconds = 1.016666... hours → rounded to 1.02
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 3660, revenue: 0 },
      0,
      STANDARD_HRS,
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.billable_hrs).toBe(1.02);
  });

  it("records the correct period metadata", () => {
    const row = buildWeeklyRow(
      42,
      { totalSeconds: 0, revenue: 0 },
      0,
      STANDARD_HRS,
      3,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.period_start).toBe(PERIOD_START);
    expect(row.period_end).toBe(PERIOD_END);
    expect(row.period_type).toBe("week");
    expect(row.staff_id).toBe(42);
    expect(row.tasks_completed).toBe(3);
  });

  it("sets nonbillable_hrs=0 as per current implementation note", () => {
    // The route documents nonbillable_hrs as 0 until Accelo sync is extended
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 3600, revenue: 150 },
      50,
      STANDARD_HRS,
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.nonbillable_hrs).toBe(0);
  });
});

// ── Utilization edge cases ─────────────────────────────────────────────────────

describe("utilization percentage edge cases", () => {
  const PERIOD_START = "2024-01-08";
  const PERIOD_END = "2024-01-14";

  it("returns 0 utilization when staff logged no time", () => {
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 0, revenue: 0 },
      0,
      40,
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.utilization).toBe(0);
  });

  it("returns exactly 100 utilization when staff logs exactly 40 hours", () => {
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 144_000, revenue: 0 }, // 40 hours
      0,
      40,
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.utilization).toBe(100);
  });

  it("rounds utilization to 2 decimal places (not truncated)", () => {
    // 1 hr / 40 = 0.025 = 2.5%
    const row = buildWeeklyRow(
      1,
      { totalSeconds: 3600, revenue: 0 }, // 1 hour
      0,
      40,
      0,
      PERIOD_START,
      PERIOD_END
    );
    expect(row.utilization).toBe(2.5);
  });
});
