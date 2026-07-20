import { describe, expect, it } from "vitest";
import { decimalToCents, formatCents, parseGermanAmount } from "./money";

describe("money", () => {
  it("formats cents de-DE", () => {
    expect(formatCents(-123456n)).toBe("−1.234,56 €");
    expect(formatCents(1200n)).toBe("12,00 €");
  });

  it("parses german amounts", () => {
    expect(parseGermanAmount("-1.234,56")).toBe(-123456n);
    expect(parseGermanAmount("12,00 €")).toBe(1200n);
    expect(parseGermanAmount("1.000,00")).toBe(100000n);
  });

  it("parses english csv amounts (revolut)", () => {
    expect(parseGermanAmount("-9.99")).toBe(-999n);
    expect(parseGermanAmount("1234.56")).toBe(123456n);
  });

  it("throws on unparseable input", () => {
    expect(() => parseGermanAmount("abc")).toThrow();
    expect(() => parseGermanAmount("")).toThrow();
  });

  it("decimalToCents parses api decimals exactly", () => {
    expect(decimalToCents("-12.5")).toBe(-1250n);
    expect(decimalToCents("3")).toBe(300n);
    expect(decimalToCents("0.01")).toBe(1n);
    expect(decimalToCents("9999.99")).toBe(999999n);
  });
});

describe("formatCents — DS-Minuszeichen", () => {
  it("nutzt Unicode-Minus U+2212 statt ASCII-Hyphen", () => {
    const out = formatCents(-999n);
    expect(out).toContain("−");
    expect(out).not.toContain("-");
    expect(out).toBe("−9,99 €");
  });

  it("lässt positive Beträge unverändert", () => {
    expect(formatCents(104372n)).toBe("1.043,72 €");
  });

  it("bleibt round-trip-fähig mit parseGermanAmount", () => {
    for (const cents of [-999n, -890000n, 0n, 104372n]) {
      expect(parseGermanAmount(formatCents(cents))).toBe(cents);
    }
  });
});
