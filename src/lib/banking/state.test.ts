import { beforeAll, describe, expect, it } from "vitest";
import { signState, verifyState } from "./state";

describe("state token", () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
  });

  it("round-trips a signed payload", () => {
    const token = signState({ aspsp: "DKB", country: "DE" });
    const parsed = verifyState(token);
    expect(parsed).toMatchObject({ aspsp: "DKB", country: "DE" });
  });

  it("rejects a tampered token", () => {
    const token = signState({ aspsp: "DKB" });
    const [body] = token.split(".");
    expect(verifyState(`${body}.deadbeef`)).toBeNull();
    expect(verifyState("garbage")).toBeNull();
  });

  it("adds a nonce so identical payloads differ", () => {
    expect(signState({ a: "1" })).not.toBe(signState({ a: "1" }));
  });
});
