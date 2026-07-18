import { describe, expect, it } from "vitest";
import { fingerprintOf, normalizePurpose, unwrapPaypal } from "./normalize";

describe("normalizePurpose", () => {
  it("strips sepa boilerplate", () => {
    expect(
      normalizePurpose("NETFLIX ABO EREF+X123 MREF+M9 CRED+DE98ZZZ09999999999 IBAN: DE12..."),
    ).toBe("NETFLIX ABO");
  });
  it("returns empty for null", () => {
    expect(normalizePurpose(null)).toBe("");
  });
});

describe("unwrapPaypal", () => {
  it("unwraps paypal merchants", () => {
    expect(
      unwrapPaypal("PayPal (Europe) S.a.r.l. et Cie, S.C.A.", "PP.4051.PP . NETFLIX, Ihr Einkauf bei NETFLIX"),
    ).toEqual({ merchant: "NETFLIX" });
    expect(
      unwrapPaypal("PayPal Europe S.a.r.l.", "1039284756273 PP .SPOTIFY, Ihr Einkauf bei SPOTIFY"),
    ).toEqual({ merchant: "SPOTIFY" });
  });
  it("returns null for non-paypal", () => {
    expect(unwrapPaypal("REWE Markt GmbH", "Einkauf")).toBeNull();
  });
});

describe("fingerprintOf", () => {
  it("builds stable fingerprints from counterparty", () => {
    expect(fingerprintOf("REWE Markt GmbH Fil. 0421", null)).toBe("rewe markt gmbh fil");
  });
  it("is stable across varying order numbers", () => {
    expect(fingerprintOf(null, "AMAZON.DE 302-99 RETOURE")).toBe(
      fingerprintOf(null, "AMAZON.DE 305-11 retoure"),
    );
  });
  it("uses unwrapped paypal merchant for fingerprint", () => {
    expect(fingerprintOf("PayPal Europe S.a.r.l.", "PP.1.PP . NETFLIX, Ihr Einkauf bei NETFLIX")).toBe(
      "netflix",
    );
  });
});
