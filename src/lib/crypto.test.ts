import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

describe("crypto", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  });

  it("round-trips a value", () => {
    const enc = encrypt("session-secret-123");
    expect(enc).not.toContain("session-secret-123");
    expect(decrypt(enc)).toBe("session-secret-123");
  });

  it("produces different ciphertext each time (random iv)", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("throws on tampering", () => {
    const enc = encrypt("value");
    const [iv, tag, data] = enc.split(":");
    const tampered = `${iv}:${tag}:${data.slice(0, -2)}ff`;
    expect(() => decrypt(tampered)).toThrow();
  });
});
