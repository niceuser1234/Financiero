import { describe, expect, it } from "vitest";
import { CHART_COLORS, chartColorAt, initialFor, toneForCents } from "./format";

describe("initialFor", () => {
  it("liefert den ersten Buchstaben in Großschreibung", () => {
    expect(initialFor("REWE")).toBe("R");
    expect(initialFor("spotify")).toBe("S");
  });

  it("ignoriert führenden Leerraum", () => {
    expect(initialFor("  dm-drogerie")).toBe("D");
  });

  it("fällt bei leerem oder fehlendem Namen auf ? zurück", () => {
    expect(initialFor("")).toBe("?");
    expect(initialFor("   ")).toBe("?");
    expect(initialFor(null)).toBe("?");
    expect(initialFor(undefined)).toBe("?");
  });

  it("behandelt Umlaute korrekt", () => {
    expect(initialFor("Über Wasser GmbH")).toBe("Ü");
  });
});

describe("toneForCents", () => {
  it("markiert positive Beträge als Einnahme", () => {
    expect(toneForCents(1n)).toBe("income");
  });

  it("markiert Ausgaben und Null als neutral — Rot ist keine Betragsfarbe", () => {
    expect(toneForCents(-999n)).toBe("neutral");
    expect(toneForCents(0n)).toBe("neutral");
  });
});

describe("chartColorAt", () => {
  it("liefert die Palette in Reihenfolge", () => {
    expect(chartColorAt(0)).toBe("var(--chart-1)");
    expect(chartColorAt(7)).toBe("var(--chart-8)");
  });

  it("rotiert über das Palettenende hinaus", () => {
    expect(chartColorAt(8)).toBe("var(--chart-1)");
    expect(chartColorAt(9)).toBe("var(--chart-2)");
  });

  it("hat genau acht Farben", () => {
    expect(CHART_COLORS).toHaveLength(8);
  });
});
