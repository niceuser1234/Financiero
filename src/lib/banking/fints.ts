import { NeedTanError, type ProviderBalance, type ProviderTransaction, type ReadProvider } from "./types";

export interface FintsProviderConfig {
  baseUrl: string;
  token: string;
  blz: string;
  user: string;
  pin: string;
  endpoint: string;
  productId: string;
  clientState: string;
  fetchImpl?: typeof fetch;
}

interface RawTx {
  entry_ref: string | null;
  booking_date: string;
  value_date: string | null;
  amount_cents: number;
  currency: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  purpose: string | null;
  raw: unknown;
}

export class FintsProvider implements ReadProvider {
  private fetchImpl: typeof fetch;
  constructor(private cfg: FintsProviderConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private creds() {
    return {
      blz: this.cfg.blz, user: this.cfg.user, pin: this.cfg.pin,
      endpoint: this.cfg.endpoint, product_id: this.cfg.productId,
      client_state: this.cfg.clientState,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": this.cfg.token },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`FinTS-Sidecar ${res.status}: ${await res.text().catch(() => "")}`);
    return (await res.json()) as T;
  }

  async fetchBalances(_sessionId: string, accountUids: string[]): Promise<ProviderBalance[]> {
    const data = await this.post<{ balances: Array<{ iban: string; amount_cents: number; currency: string }> }>(
      "/balances", { ...this.creds(), ibans: accountUids },
    );
    return data.balances.map((b) => ({
      accountUid: b.iban, amountCents: BigInt(b.amount_cents), currency: b.currency,
    }));
  }

  async fetchTransactions(_sessionId: string, accountUid: string, sinceISO: string): Promise<ProviderTransaction[]> {
    const data = await this.post<{ status: string; transactions?: RawTx[] }>(
      "/transactions", { ...this.creds(), iban: accountUid, since: sinceISO },
    );
    if (data.status === "need_tan") throw new NeedTanError();
    return (data.transactions ?? []).map((t) => ({
      accountUid, entryRef: t.entry_ref, bookingDate: t.booking_date, valueDate: t.value_date,
      amountCents: BigInt(t.amount_cents), currency: t.currency,
      counterpartyName: t.counterparty_name, counterpartyIban: t.counterparty_iban,
      purpose: t.purpose, raw: t.raw,
    }));
  }
}
