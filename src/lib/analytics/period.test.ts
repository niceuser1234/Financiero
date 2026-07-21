import { describe, it, expect } from "vitest";
import { currentMonthWindow, monthLabelDE } from "./period";

describe("period", () => {
  it("windows the current calendar month to today", () => {
    const w = currentMonthWindow(new Date("2026-07-21T10:00:00Z"));
    expect(w.from).toBe("2026-07-01");
    expect(w.to).toBe("2026-07-21");
    expect(w.monthEnd).toBe("2026-07-31");
  });
  it("labels the month in German", () => {
    expect(monthLabelDE(new Date("2026-07-21T10:00:00Z"))).toBe("Juli 2026");
  });
});
