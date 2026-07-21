import { describe, expect, it } from "vitest";
import { groupByCadence } from "./queries";
import type { RecurringDTO } from "./queries";

function dto(cadence: string): RecurringDTO {
  return {
    id: cadence, merchantName: "X", categoryColor: "#000", cadence,
    cadenceLabel: cadence, kind: "subscription", monthlyEquivFmt: "0", monthlyEquivAbs: 0,
    amountLastFmt: "0", nextExpectedDate: null, nextRelative: null, status: "active", priceChanged: false,
  };
}

describe("groupByCadence", () => {
  it("bucketet monthly/quarterly/yearly und faltet weekly in monthly", () => {
    const g = groupByCadence([dto("monthly"), dto("weekly"), dto("quarterly"), dto("yearly")]);
    expect(g.monthly).toHaveLength(2); // monthly + weekly
    expect(g.quarterly).toHaveLength(1);
    expect(g.yearly).toHaveLength(1);
  });
});
