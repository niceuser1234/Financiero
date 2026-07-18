import { createHash } from "node:crypto";

export interface ImportHashInput {
  accountId: string;
  bookingDate: string;
  amountCents: bigint;
  currency: string;
  counterparty?: string | null;
  purpose?: string | null;
}

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stabiler Dedupe-Hash über die identitätstragenden Felder einer Buchung.
 * Whitespace- und case-insensitiv bei Gegenpartei/Verwendungszweck, damit
 * CSV- und API-Quelle für dieselbe Buchung denselben Hash erzeugen.
 */
export function importHash(input: ImportHashInput): string {
  const parts = [
    input.accountId,
    input.bookingDate,
    input.amountCents.toString(),
    input.currency,
    normalize(input.counterparty) + " " + normalize(input.purpose),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
