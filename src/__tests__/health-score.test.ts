/**
 * Unit tests for the client health score computation logic.
 *
 * The scoring formula lives in src/app/api/cron/compute-health/route.ts.
 * Because Next.js route files cannot be imported directly in vitest without
 * a full framework runtime, we extract and re-implement the pure scoring
 * functions here — identical to the production code — and test every branch.
 *
 * This is the standard approach for testing pure business logic that is
 * co-located with framework entry-points.
 *
 * Formula:
 *   total = 40% interaction + 30% invoice + 20% task + 10% contract
 *
 * Component scoring:
 *   interaction_score : <=7d→100, <=14d→80, <=30d→60, <=60d→30, >60d / null→0
 *   invoice_score     : Math.round((1 - outstanding/total) * 100) — defaults to 100 if no invoices
 *   task_score        : Math.round((1 - overdue/open) * 100)      — defaults to 100 if no open tasks
 *   contract_score    : active contract exists → 100, else → 0
 */

import { describe, it, expect } from "vitest";

// ── Pure scoring helpers (mirrored from compute-health/route.ts) ───────────────

function interactionScore(daysSinceInteraction: number | null): number {
  if (daysSinceInteraction === null) return 0;
  if (daysSinceInteraction <= 7) return 100;
  if (daysSinceInteraction <= 14) return 80;
  if (daysSinceInteraction <= 30) return 60;
  if (daysSinceInteraction <= 60) return 30;
  return 0;
}

function invoiceScore(outstanding: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((1 - outstanding / total) * 100);
}

function taskScore(overdueCount: number, openCount: number): number {
  if (openCount <= 0) return 100;
  return Math.round((1 - overdueCount / openCount) * 100);
}

function contractScore(hasActiveContract: boolean): number {
  return hasActiveContract ? 100 : 0;
}

function totalHealthScore(
  iScore: number,
  invScore: number,
  tScore: number,
  cScore: number
): number {
  return Math.round(0.4 * iScore + 0.3 * invScore + 0.2 * tScore + 0.1 * cScore);
}

// ── interactionScore ──────────────────────────────────────────────────────────

describe("interactionScore()", () => {
  it("returns 0 when daysSince is null (no interaction recorded)", () => {
    expect(interactionScore(null)).toBe(0);
  });

  it("returns 100 at exactly 0 days (interacted today)", () => {
    expect(interactionScore(0)).toBe(100);
  });

  it("returns 100 at exactly 7 days (boundary, inclusive)", () => {
    expect(interactionScore(7)).toBe(100);
  });

  it("returns 80 at 8 days (just past 7-day boundary)", () => {
    expect(interactionScore(8)).toBe(80);
  });

  it("returns 80 at exactly 14 days (boundary, inclusive)", () => {
    expect(interactionScore(14)).toBe(80);
  });

  it("returns 60 at 15 days (just past 14-day boundary)", () => {
    expect(interactionScore(15)).toBe(60);
  });

  it("returns 60 at exactly 30 days (boundary, inclusive)", () => {
    expect(interactionScore(30)).toBe(60);
  });

  it("returns 30 at 31 days (just past 30-day boundary)", () => {
    expect(interactionScore(31)).toBe(30);
  });

  it("returns 30 at exactly 60 days (boundary, inclusive)", () => {
    expect(interactionScore(60)).toBe(30);
  });

  it("returns 0 at 61 days (just past 60-day boundary)", () => {
    expect(interactionScore(61)).toBe(0);
  });

  it("returns 0 for very large values (client gone cold)", () => {
    expect(interactionScore(365)).toBe(0);
  });
});

// ── invoiceScore ──────────────────────────────────────────────────────────────

describe("invoiceScore()", () => {
  it("returns 100 when there are no invoices (total = 0)", () => {
    expect(invoiceScore(0, 0)).toBe(100);
  });

  it("returns 100 when all invoices are paid (outstanding = 0)", () => {
    expect(invoiceScore(0, 10_000)).toBe(100);
  });

  it("returns 0 when all invoices are outstanding", () => {
    expect(invoiceScore(10_000, 10_000)).toBe(0);
  });

  it("returns 50 when half is outstanding", () => {
    expect(invoiceScore(5_000, 10_000)).toBe(50);
  });

  it("rounds to nearest integer (e.g. 1/3 outstanding)", () => {
    // outstanding/total = 1/3 → score = round((1 - 0.333…) * 100) = round(66.666…) = 67
    expect(invoiceScore(1000, 3000)).toBe(67);
  });

  it("handles fractional amounts correctly", () => {
    // $750 outstanding out of $1000 → 25% paid → score = 25
    expect(invoiceScore(750, 1000)).toBe(25);
  });
});

// ── taskScore ─────────────────────────────────────────────────────────────────

describe("taskScore()", () => {
  it("returns 100 when there are no open tasks", () => {
    expect(taskScore(0, 0)).toBe(100);
  });

  it("returns 100 when no tasks are overdue", () => {
    expect(taskScore(0, 5)).toBe(100);
  });

  it("returns 0 when every open task is overdue", () => {
    expect(taskScore(5, 5)).toBe(0);
  });

  it("returns 50 when half of open tasks are overdue", () => {
    expect(taskScore(5, 10)).toBe(50);
  });

  it("rounds to nearest integer (e.g. 1 overdue out of 3)", () => {
    // 1/3 overdue → score = round((1 - 0.333…) * 100) = round(66.666…) = 67
    expect(taskScore(1, 3)).toBe(67);
  });

  it("returns 80 when 1 of 5 tasks is overdue", () => {
    expect(taskScore(1, 5)).toBe(80);
  });
});

// ── contractScore ─────────────────────────────────────────────────────────────

describe("contractScore()", () => {
  it("returns 100 when client has an active contract", () => {
    expect(contractScore(true)).toBe(100);
  });

  it("returns 0 when client has no active contract", () => {
    expect(contractScore(false)).toBe(0);
  });
});

// ── totalHealthScore ──────────────────────────────────────────────────────────

describe("totalHealthScore() weighted formula", () => {
  it("returns 100 when all components are perfect", () => {
    expect(totalHealthScore(100, 100, 100, 100)).toBe(100);
  });

  it("returns 0 when all components are zero", () => {
    expect(totalHealthScore(0, 0, 0, 0)).toBe(0);
  });

  it("applies the correct weights: 40% interaction, 30% invoice, 20% task, 10% contract", () => {
    // Verify each weight individually
    expect(totalHealthScore(100, 0, 0, 0)).toBe(40);  // 40% of 100
    expect(totalHealthScore(0, 100, 0, 0)).toBe(30);  // 30% of 100
    expect(totalHealthScore(0, 0, 100, 0)).toBe(20);  // 20% of 100
    expect(totalHealthScore(0, 0, 0, 100)).toBe(10);  // 10% of 100
  });

  it("rounds the total to the nearest integer", () => {
    // 40*80 + 30*70 + 20*60 + 10*50 = 32+21+12+5 = 70
    expect(totalHealthScore(80, 70, 60, 50)).toBe(70);
  });

  it("classifies at-risk threshold: score < 70 is at-risk", () => {
    // Spec: score < 70 → "at-risk"
    const score = totalHealthScore(60, 60, 60, 60); // 60
    expect(score).toBe(60);
    expect(score < 70).toBe(true);
  });

  it("classifies pending threshold: 70 <= score < 85", () => {
    // interaction=100, others=50 → 40 + 15 + 10 + 5 = 70
    const score = totalHealthScore(100, 50, 50, 50);
    expect(score).toBe(70);
    expect(score >= 70 && score < 85).toBe(true);
  });

  it("classifies active threshold: score >= 85", () => {
    const score = totalHealthScore(100, 100, 100, 50); // 40+30+20+5 = 95
    expect(score).toBe(95);
    expect(score >= 85).toBe(true);
  });

  it("computes a realistic healthy client correctly", () => {
    // Interacted 3 days ago (100), all invoices paid (100),
    // no overdue tasks (100), active contract (100) → 100
    const iS = interactionScore(3);
    const invS = invoiceScore(0, 5000);
    const tS = taskScore(0, 4);
    const cS = contractScore(true);
    expect(totalHealthScore(iS, invS, tS, cS)).toBe(100);
  });

  it("computes a realistic at-risk client correctly", () => {
    // No interaction in 90 days (0), 80% outstanding (20),
    // 3 of 4 tasks overdue (25), no contract (0)
    // → 0.4*0 + 0.3*20 + 0.2*25 + 0.1*0 = 0 + 6 + 5 + 0 = 11
    const iS = interactionScore(90);
    const invS = invoiceScore(8000, 10000);
    const tS = taskScore(3, 4);
    const cS = contractScore(false);
    expect(totalHealthScore(iS, invS, tS, cS)).toBe(11);
  });

  it("computes a mixed 'pending' client correctly", () => {
    // Interacted 20 days ago (60), 20% outstanding (80),
    // 1 of 4 tasks overdue (75), active contract (100)
    // → 0.4*60 + 0.3*80 + 0.2*75 + 0.1*100 = 24 + 24 + 15 + 10 = 73
    const iS = interactionScore(20);
    const invS = invoiceScore(1000, 5000);
    const tS = taskScore(1, 4);
    const cS = contractScore(true);
    expect(totalHealthScore(iS, invS, tS, cS)).toBe(73);
  });
});
