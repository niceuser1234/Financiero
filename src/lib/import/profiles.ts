import { parseGermanAmount } from "@/lib/money";

export interface ParsedRow {
  bookingDate: string;
  valueDate: string | null;
  amountCents: bigint;
  currency: string;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  purpose: string | null;
  raw: Record<string, string>;
}

export type ProfileId = "dkb" | "dkb_visa" | "revolut" | "paypal";

export interface CsvProfile {
  id: ProfileId;
  label: string;
  delimiter: string;
  /** Entfernt Metazeilen vor dem eigentlichen Header (DKB). */
  sliceToHeader?: (lines: string[]) => string[];
  /** true = Zeile überspringen (z.B. nicht abgeschlossen). */
  skip?: (row: Record<string, string>) => boolean;
  map: (row: Record<string, string>) => ParsedRow;
}

/** dd.MM.yy oder dd.MM.yyyy -> ISO YYYY-MM-DD. */
export function parseDmy(s: string): string {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) throw new Error(`Ungültiges Datum: "${s}"`);
  const [, d, mo, y] = m;
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "2026-07-01 10:00:00" -> "2026-07-01". */
export function parseIsoDate(s: string): string {
  const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) throw new Error(`Ungültiges Datum: "${s}"`);
  return m[1];
}

export const PROFILES: Record<ProfileId, CsvProfile> = {
  dkb: {
    id: "dkb",
    label: "DKB Girokonto",
    delimiter: ";",
    sliceToHeader: (lines) => {
      const idx = lines.findIndex((l) => l.replace(/"/g, "").startsWith("Buchungsdatum"));
      return idx >= 0 ? lines.slice(idx) : lines;
    },
    map: (r) => {
      const amount = parseGermanAmount(r["Betrag (€)"] ?? r["Betrag"] ?? "");
      const isOut = amount < 0n;
      return {
        bookingDate: parseDmy(r["Buchungsdatum"]),
        valueDate: r["Wertstellung"] ? parseDmy(r["Wertstellung"]) : null,
        amountCents: amount,
        currency: "EUR",
        counterpartyName: (isOut ? r["Zahlungsempfänger*in"] : r["Zahlungspflichtige*r"]) || null,
        counterpartyIban: r["IBAN"] || null,
        purpose: r["Verwendungszweck"] || null,
        raw: r,
      };
    },
  },

  dkb_visa: {
    id: "dkb_visa",
    label: "DKB Visa Kreditkarte",
    delimiter: ";",
    sliceToHeader: (lines) => {
      const idx = lines.findIndex((l) => l.replace(/"/g, "").startsWith("Belegdatum"));
      return idx >= 0 ? lines.slice(idx) : lines;
    },
    map: (r) => {
      const desc = r["Beschreibung"] || null;
      return {
        bookingDate: parseDmy(r["Belegdatum"]),
        valueDate: r["Wertstellung"] ? parseDmy(r["Wertstellung"]) : null,
        amountCents: parseGermanAmount(r["Betrag (€)"] ?? r["Betrag"] ?? ""),
        currency: "EUR",
        counterpartyName: desc,
        counterpartyIban: null,
        purpose: desc,
        raw: r,
      };
    },
  },

  revolut: {
    id: "revolut",
    label: "Revolut",
    delimiter: ",",
    skip: (r) => (r["State"] ?? "").toUpperCase() !== "COMPLETED",
    map: (r) => {
      const dateSrc = r["Completed Date"] || r["Started Date"];
      return {
        bookingDate: parseIsoDate(dateSrc),
        valueDate: r["Started Date"] ? parseIsoDate(r["Started Date"]) : null,
        amountCents: parseGermanAmount(r["Amount"]),
        currency: r["Currency"] || "EUR",
        counterpartyName: r["Description"] || null,
        counterpartyIban: null,
        purpose: [r["Type"], r["Description"]].filter(Boolean).join(" – ") || null,
        raw: r,
      };
    },
  },

  paypal: {
    id: "paypal",
    label: "PayPal",
    delimiter: ",",
    skip: (r) => (r["Status"] ?? "") !== "Abgeschlossen",
    map: (r) => ({
      bookingDate: parseDmy(r["Datum"]),
      valueDate: null,
      amountCents: parseGermanAmount(r["Brutto"]),
      currency: r["Währung"] || "EUR",
      counterpartyName: r["Name"] || null,
      counterpartyIban: null,
      purpose: [r["Typ"], r["Name"]].filter(Boolean).join(" – ") || null,
      raw: r,
    }),
  },
};
