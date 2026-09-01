import { afterEach, describe, expect, it, vi } from "vitest";
import { getFintsProductId, getFintsProductVersion } from "./fints-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getFintsProductId", () => {
  it("prefers the server configuration over a stored legacy value", () => {
    vi.stubEnv("FINTS_PRODUCT_ID", "SERVERPRODUCTID");
    expect(getFintsProductId("OLDPRODUCTID")).toBe("SERVERPRODUCTID");
  });

  it("uses a valid stored value as a backwards-compatible fallback", () => {
    vi.stubEnv("FINTS_PRODUCT_ID", "");
    expect(getFintsProductId("OLDPRODUCTID")).toBe("OLDPRODUCTID");
  });

  it("rejects a missing or malformed product ID", () => {
    vi.stubEnv("FINTS_PRODUCT_ID", "");
    expect(() => getFintsProductId()).toThrow("FINTS_PRODUCT_ID fehlt");
    expect(() => getFintsProductId("not valid!")).toThrow("1–25 Buchstaben oder Ziffern");
  });

  it("provides the app product version in the FinTS field's five-character limit", () => {
    vi.stubEnv("FINTS_PRODUCT_VERSION", "0.1.0");
    expect(getFintsProductVersion()).toBe("0.1.0");
    vi.stubEnv("FINTS_PRODUCT_VERSION", "version-too-long");
    expect(() => getFintsProductVersion()).toThrow("1–5");
  });
});
