import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { EnableBankingClient, makeJwt, mapEbTransaction } from "./enable-banking";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("makeJwt", () => {
  it("produces a 3-segment RS256 token with kid header", () => {
    const jwt = makeJwt("app-123", pem);
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    expect(header).toMatchObject({ alg: "RS256", kid: "app-123", typ: "JWT" });
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    expect(payload).toMatchObject({ iss: "enablebanking.com", aud: "api.enablebanking.com" });
    expect(payload.exp - payload.iat).toBe(3600);
  });
});

describe("mapEbTransaction", () => {
  it("maps debit to negative cents with creditor as counterparty", () => {
    const tx = mapEbTransaction("acc1", {
      entry_reference: "ref-1",
      booking_date: "2026-07-01",
      value_date: "2026-07-02",
      transaction_amount: { amount: "12.99", currency: "EUR" },
      credit_debit_indicator: "DBIT",
      creditor: { name: "Netflix" },
      creditor_account: { iban: "DE111" },
      remittance_information: ["ABO", "12345"],
    });
    expect(tx.amountCents).toBe(-1299n);
    expect(tx.counterpartyName).toBe("Netflix");
    expect(tx.purpose).toBe("ABO 12345");
    expect(tx.entryRef).toBe("ref-1");
  });

  it("maps credit to positive cents with debtor as counterparty", () => {
    const tx = mapEbTransaction("acc1", {
      transaction_amount: { amount: "2500.00", currency: "EUR" },
      credit_debit_indicator: "CRDT",
      debtor: { name: "Arbeitgeber GmbH" },
    });
    expect(tx.amountCents).toBe(250000n);
    expect(tx.counterpartyName).toBe("Arbeitgeber GmbH");
  });
});

describe("EnableBankingClient.fetchTransactions", () => {
  it("follows continuation_key across pages", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: [
            { entry_reference: "a", booking_date: "2026-07-01", transaction_amount: { amount: "1.00", currency: "EUR" }, credit_debit_indicator: "DBIT" },
          ],
          continuation_key: "PAGE2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: [
            { entry_reference: "b", booking_date: "2026-07-02", transaction_amount: { amount: "2.00", currency: "EUR" }, credit_debit_indicator: "DBIT" },
          ],
        }),
      );

    const client = new EnableBankingClient({
      appId: "app",
      privateKeyPem: pem,
      redirectUrl: "http://localhost:3000/api/banking/callback",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const txs = await client.fetchTransactions("sess", "acc1", "2026-06-01");
    expect(txs.map((t) => t.entryRef)).toEqual(["a", "b"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[1][0] as string)).toContain("continuation_key=PAGE2");
  });

  it("throws EnableBankingError on non-2xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, false, 403));
    const client = new EnableBankingClient({
      appId: "app",
      privateKeyPem: pem,
      redirectUrl: "http://x/cb",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.fetchBalances("s", ["acc1"])).rejects.toThrow(/403/);
  });
});
