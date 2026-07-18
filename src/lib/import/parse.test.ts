import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./parse";

const fixture = (name: string) =>
  readFileSync(path.resolve(__dirname, "__fixtures__", name), "utf8");

describe("parseCsv DKB", () => {
  const { rows, errors } = parseCsv("dkb", fixture("dkb.csv"));
  it("parses all booked rows past the metadata header", () => {
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(5);
  });
  it("maps dates, cents and direction", () => {
    const netflix = rows[0];
    expect(netflix.bookingDate).toBe("2026-07-01");
    expect(netflix.amountCents).toBe(-1299n);
    expect(netflix.counterpartyName).toBe("NETFLIX INTERNATIONAL B.V.");
    const salary = rows[1];
    expect(salary.amountCents).toBe(250000n);
    expect(salary.counterpartyName).toBe("ARBEITGEBER GMBH");
  });
});

describe("parseCsv Revolut", () => {
  const { rows } = parseCsv("revolut", fixture("revolut.csv"));
  it("skips non-completed rows", () => {
    // 5 data rows, 1 PENDING skipped -> 4
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.raw["State"] === "COMPLETED")).toBe(true);
  });
  it("parses english decimal amounts", () => {
    expect(rows[0].amountCents).toBe(-999n);
    expect(rows[0].bookingDate).toBe("2026-07-01");
  });
});

describe("parseCsv PayPal", () => {
  const { rows } = parseCsv("paypal", fixture("paypal.csv"));
  it("skips pending rows and parses german amounts", () => {
    // 4 rows, 1 "Ausstehend" skipped -> 3
    expect(rows).toHaveLength(3);
    expect(rows[0].amountCents).toBe(-1299n);
    expect(rows[0].counterpartyName).toBe("Netflix International B.V.");
  });
});

describe("parseCsv error handling", () => {
  it("collects broken rows instead of throwing", () => {
    const broken = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,NOTADATE,NOTADATE,Bad,-9.99,0.00,EUR,COMPLETED,0.01`;
    const { rows, errors } = parseCsv("revolut", broken);
    expect(rows).toHaveLength(0);
    expect(errors.length).toBe(1);
  });
});
