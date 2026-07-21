import { describe, expect, it } from "vitest";
import { brandKeyOf, fingerprintOf, isNonRecurringBrand, matchBrand, normalizePurpose, unwrapPaypal } from "./normalize";

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
    // REWE mapped to brand alias
    expect(fingerprintOf("REWE Markt GmbH Fil. 0421", null)).toBe("rewe");
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
  it("unifies anthropic/claude variants", () => {
    expect(fingerprintOf("CLAUDE.AI SUBSCRIPTION", "CLAUDE.AI SUBSCRIPTION")).toBe("anthropic claude");
    expect(fingerprintOf("ANTHROPIC* CLAUDE SUB", "ANTHROPIC* CLAUDE SUB")).toBe("anthropic claude");
    expect(fingerprintOf("ANTHROPIC", "ANTHROPIC")).toBe("anthropic claude");
  });
  it("unifies spotify via paypal", () => {
    expect(
      fingerprintOf(
        "PayPal Europe S.a.r.l. et Cie S.C.A",
        "1051799357335/PP.5306.PP/. Spotify AB, Ihr Einkauf bei Spotify AB",
      ),
    ).toBe("spotify");
  });
});

describe("matchBrand / brandKeyOf", () => {
  it("maps display names", () => {
    expect(matchBrand("claude ai subscription")?.name).toBe("Claude AI");
    expect(brandKeyOf("claude ai subscription")).toBe("anthropic claude");
    expect(brandKeyOf("anthropic claude sub")).toBe("anthropic claude");
  });
});

describe("isNonRecurringBrand", () => {
  it("flags retail/food/marketplace merchants", () => {
    for (const s of ["REWE Markt", "ALDI SUED", "Konsum Leipzig", "Deutsche Bahn", "dm-drogerie", "MC DOENER"]) {
      expect(isNonRecurringBrand(s)).toBe(true);
    }
  });
  it("does not flag real subscriptions", () => {
    expect(isNonRecurringBrand("Spotify AB")).toBe(false);
    expect(isNonRecurringBrand("Netflix")).toBe(false);
  });
});
