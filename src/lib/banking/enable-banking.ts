import { createSign } from "node:crypto";
import { decimalToCents } from "@/lib/money";
import {
  type Aspsp,
  type BankProvider,
  type ProviderAccount,
  type ProviderBalance,
  type ProviderTransaction,
  EnableBankingError,
} from "./types";

export interface EnableBankingConfig {
  appId: string;
  privateKeyPem: string;
  redirectUrl: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE = "https://api.enablebanking.com";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Enable Banking verlangt ein selbstsigniertes RS256-JWT als Bearer-Token. */
export function makeJwt(appId: string, privateKeyPem: string, now = Math.floor(Date.now() / 1000)): string {
  const header = { typ: "JWT", alg: "RS256", kid: appId };
  const payload = {
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKeyPem, "base64url");
  return `${signingInput}.${signature}`;
}

interface EbRawTransaction {
  entry_reference?: string;
  booking_date?: string;
  value_date?: string;
  transaction_amount?: { amount?: string; currency?: string };
  credit_debit_indicator?: "CRDT" | "DBIT";
  creditor?: { name?: string };
  debtor?: { name?: string };
  creditor_account?: { iban?: string };
  debtor_account?: { iban?: string };
  remittance_information?: string[];
}

/** Wandelt eine Enable-Banking-Transaktion in unser Provider-Format (Cents, Vorzeichen). */
export function mapEbTransaction(accountUid: string, t: EbRawTransaction): ProviderTransaction {
  const raw = t.transaction_amount?.amount ?? "0";
  const magnitude = decimalToCents(raw.replace(/^-/, ""));
  const isDebit = t.credit_debit_indicator === "DBIT";
  const amountCents = isDebit ? -magnitude : magnitude;
  const counterpartyName = isDebit ? t.creditor?.name ?? null : t.debtor?.name ?? null;
  const counterpartyIban = isDebit
    ? t.creditor_account?.iban ?? null
    : t.debtor_account?.iban ?? null;
  return {
    accountUid,
    entryRef: t.entry_reference ?? null,
    bookingDate: t.booking_date ?? "",
    valueDate: t.value_date ?? null,
    amountCents,
    currency: t.transaction_amount?.currency ?? "EUR",
    counterpartyName,
    counterpartyIban,
    purpose: (t.remittance_information ?? []).join(" ").trim() || null,
    raw: t,
  };
}

function mapAccountType(cashAccountType?: string, product?: string): ProviderAccount["type"] {
  const p = `${cashAccountType ?? ""} ${product ?? ""}`.toLowerCase();
  if (p.includes("card") || p.includes("credit")) return "credit_card";
  return "checking";
}

export class EnableBankingClient implements BankProvider {
  private base: string;
  private fetchImpl: typeof fetch;

  constructor(private config: EnableBankingConfig) {
    this.base = config.baseUrl ?? DEFAULT_BASE;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = makeJwt(this.config.appId, this.config.privateKeyPem);
    const res = await this.fetchImpl(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new EnableBankingError(res.status, await res.text().catch(() => ""));
    }
    return (await res.json()) as T;
  }

  async getAspsps(country: string): Promise<Aspsp[]> {
    const data = await this.request<{ aspsps: Array<{ name: string; country: string; logo?: string }> }>(
      `/aspsps?country=${encodeURIComponent(country)}`,
    );
    return data.aspsps.map((a) => ({ name: a.name, country: a.country, logo: a.logo ?? null }));
  }

  async startAuth(aspsp: { name: string; country: string }, state: string): Promise<{ url: string }> {
    const validUntil = new Date(Date.now() + 89 * 24 * 3600 * 1000).toISOString();
    const data = await this.request<{ url: string }>(`/auth`, {
      method: "POST",
      body: JSON.stringify({
        access: { valid_until: validUntil },
        aspsp,
        state,
        redirect_url: this.config.redirectUrl,
        psu_type: "personal",
      }),
    });
    return { url: data.url };
  }

  async completeAuth(code: string) {
    const data = await this.request<{
      session_id: string;
      access?: { valid_until?: string };
      accounts?: Array<{
        uid: string;
        name?: string;
        product?: string;
        cash_account_type?: string;
        account_id?: { iban?: string };
        currency?: string;
      }>;
    }>(`/sessions`, { method: "POST", body: JSON.stringify({ code }) });

    const accounts: ProviderAccount[] = (data.accounts ?? []).map((a) => ({
      uid: a.uid,
      name: a.name ?? a.product ?? "Konto",
      ibanMasked: maskIban(a.account_id?.iban ?? null),
      currency: a.currency ?? "EUR",
      type: mapAccountType(a.cash_account_type, a.product),
    }));
    return { sessionId: data.session_id, validUntil: data.access?.valid_until ?? null, accounts };
  }

  async fetchBalances(_sessionId: string, accountUids: string[]): Promise<ProviderBalance[]> {
    const out: ProviderBalance[] = [];
    for (const uid of accountUids) {
      const data = await this.request<{
        balances: Array<{ balance_amount?: { amount?: string; currency?: string }; balance_type?: string }>;
      }>(`/accounts/${uid}/balances`);
      const preferred =
        data.balances.find((b) => b.balance_type === "CLBD") ?? data.balances[0];
      if (preferred?.balance_amount?.amount) {
        out.push({
          accountUid: uid,
          amountCents: decimalToCents(preferred.balance_amount.amount),
          currency: preferred.balance_amount.currency ?? "EUR",
        });
      }
    }
    return out;
  }

  async fetchTransactions(
    _sessionId: string,
    accountUid: string,
    sinceISO: string,
  ): Promise<ProviderTransaction[]> {
    const out: ProviderTransaction[] = [];
    let continuationKey: string | undefined;
    do {
      const params = new URLSearchParams({ date_from: sinceISO });
      if (continuationKey) params.set("continuation_key", continuationKey);
      const data = await this.request<{
        transactions: EbRawTransaction[];
        continuation_key?: string;
      }>(`/accounts/${accountUid}/transactions?${params.toString()}`);
      for (const t of data.transactions ?? []) out.push(mapEbTransaction(accountUid, t));
      continuationKey = data.continuation_key;
    } while (continuationKey);
    return out;
  }
}

function maskIban(iban: string | null): string | null {
  if (!iban) return null;
  if (iban.length <= 8) return iban;
  return `${iban.slice(0, 4)}…${iban.slice(-4)}`;
}

/** Baut den Client aus Umgebungsvariablen (Private Key ist base64-kodiertes PEM). */
export function enableBankingFromEnv(fetchImpl?: typeof fetch): EnableBankingClient {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const keyB64 = process.env.ENABLE_BANKING_PRIVATE_KEY;
  if (!appId || !keyB64) {
    throw new Error("ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY nicht gesetzt");
  }
  const privateKeyPem = Buffer.from(keyB64, "base64").toString("utf8");
  const redirectUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/api/banking/callback`;
  return new EnableBankingClient({ appId, privateKeyPem, redirectUrl, fetchImpl });
}
