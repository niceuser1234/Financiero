import { describe, it, expect } from "vitest";
import { analysisWindows, currentMonthWindow, dateKeyDE, monthLabelDE } from "./period";

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

describe("analysisWindows", () => {
  it("compares a partial month with the immediately preceding equally long period", () => {
    expect(analysisWindows(new Date(2026, 7, 17, 12), "month")).toEqual({
      current: { from: "2026-08-01", to: "2026-08-17" },
      previous: { from: "2026-07-15", to: "2026-07-31" },
      days: 17,
    });
  });

  it("keeps quarter windows at exactly 90 inclusive calendar days", () => {
    expect(analysisWindows(new Date(2026, 7, 17, 12), "quarter")).toEqual({
      current: { from: "2026-05-20", to: "2026-08-17" },
      previous: { from: "2026-02-19", to: "2026-05-19" },
      days: 90,
    });
  });

  it("handles the first day of a year across the year boundary", () => {
    expect(analysisWindows(new Date(2027, 0, 1, 12), "month")).toEqual({
      current: { from: "2027-01-01", to: "2027-01-01" },
      previous: { from: "2026-12-31", to: "2026-12-31" },
      days: 1,
    });
  });

  it("keeps rolling year windows at exactly 365 days across leap years", () => {
    expect(analysisWindows(new Date(2024, 1, 29, 12), "year")).toEqual({
      current: { from: "2023-03-02", to: "2024-02-29" },
      previous: { from: "2022-03-02", to: "2023-03-01" },
      days: 365,
    });
  });

  it("uses the Berlin calendar day around the UTC midnight boundary", () => {
    expect(dateKeyDE(new Date("2026-08-17T21:59:59Z"))).toBe("2026-08-17");
    expect(dateKeyDE(new Date("2026-08-17T22:00:00Z"))).toBe("2026-08-18");

    expect(analysisWindows(new Date("2026-08-17T22:30:00Z"), "month")).toEqual({
      current: { from: "2026-08-01", to: "2026-08-18" },
      previous: { from: "2026-07-14", to: "2026-07-31" },
      days: 18,
    });
  });

  it("uses the winter UTC offset for the Berlin day boundary", () => {
    expect(dateKeyDE(new Date("2027-01-01T22:59:59Z"))).toBe("2027-01-01");
    expect(dateKeyDE(new Date("2027-01-01T23:00:00Z"))).toBe("2027-01-02");
  });
});
