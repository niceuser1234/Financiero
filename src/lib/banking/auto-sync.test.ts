import { describe, expect, it } from "vitest";
import { evaluateAutoSyncState } from "./auto-sync";

describe("evaluateAutoSyncState", () => {
  const now = new Date("2026-08-17T18:00:00.000Z");

  it("is due when no successful sync exists", () => {
    expect(evaluateAutoSyncState(now, null, null).due).toBe(true);
  });

  it("waits 24 hours after a successful bank sync", () => {
    const recent = evaluateAutoSyncState(now, new Date("2026-08-17T17:00:00.000Z"), null);
    expect(recent.due).toBe(false);
    expect(recent.nextSyncAt.toISOString()).toBe("2026-08-18T17:00:00.000Z");
  });

  it("retries an overdue failed automatic sync after one hour", () => {
    const state = evaluateAutoSyncState(
      now,
      new Date("2026-08-15T18:00:00.000Z"),
      new Date("2026-08-17T17:30:00.000Z"),
    );
    expect(state.due).toBe(false);
    expect(state.nextSyncAt.toISOString()).toBe("2026-08-17T18:30:00.000Z");
  });
});
