import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { connections } from "./schema";
import { encrypt } from "@/lib/crypto";

describe("fints connection columns", () => {
  const marker = `fints-${crypto.randomUUID()}`;
  afterAll(async () => {
    await db.delete(connections).where(eq(connections.aspspName, marker));
  });

  it("stores a fints connection with encrypted pin and state", async () => {
    const [c] = await db
      .insert(connections)
      .values({
        provider: "fints",
        aspspName: marker,
        blz: "12030000",
        fintsUserId: "user1",
        fintsEndpoint: "https://fints.dkb.de/fints",
        fintsProductId: "PRODID",
        pinEnc: encrypt("1234"),
        fintsStateEnc: encrypt("state-blob"),
        tanMechanism: "decoupled",
      })
      .returning();
    expect(c.provider).toBe("fints");
    expect(c.blz).toBe("12030000");
  });
});
