import Papa from "papaparse";
import { PROFILES, type ParsedRow, type ProfileId } from "./profiles";

export interface ParseResult {
  rows: ParsedRow[];
  errors: string[];
}

/** Parst CSV-Inhalt nach dem gewählten Bank-Profil. Fehlerzeilen werden gesammelt, nicht geworfen. */
export function parseCsv(profileId: ProfileId, content: string): ParseResult {
  const profile = PROFILES[profileId];
  const errors: string[] = [];
  const rows: ParsedRow[] = [];

  let text = content.replace(/\r\n/g, "\n").replace(/^﻿/, "");
  if (profile.sliceToHeader) {
    text = profile.sliceToHeader(text.split("\n")).join("\n");
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: profile.delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  parsed.data.forEach((row, i) => {
    // Leere/aufgefüllte Zeilen überspringen.
    if (!row || Object.values(row).every((v) => (v ?? "").trim() === "")) return;
    if (profile.skip?.(row)) return;
    try {
      rows.push(profile.map(row));
    } catch (e) {
      errors.push(`Zeile ${i + 1}: ${(e as Error).message}`);
    }
  });

  return { rows, errors };
}
