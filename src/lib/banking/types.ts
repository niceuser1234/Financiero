export interface ProviderAccount {
  uid: string;
  name: string;
  ibanMasked: string | null;
  currency: string;
  type: "checking" | "credit_card" | "emoney";
}

export interface ProviderBalance {
  accountUid: string;
  amountCents: bigint;
  currency: string;
}

export interface ProviderTransaction {
  accountUid: string;
  entryRef: string | null;
  bookingDate: string; // ISO YYYY-MM-DD
  valueDate: string | null;
  amountCents: bigint;
  currency: string;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  purpose: string | null;
  /** Von der Bank vorgemerkt, aber noch nicht endgültig gebucht. */
  pending?: boolean;
  raw: unknown;
}

export interface Aspsp {
  name: string;
  country: string;
  logo?: string | null;
}

export interface BankProvider {
  getAspsps(country: string): Promise<Aspsp[]>;
  startAuth(aspsp: { name: string; country: string }, state: string): Promise<{ url: string }>;
  completeAuth(
    code: string,
  ): Promise<{ sessionId: string; validUntil: string | null; accounts: ProviderAccount[] }>;
  fetchBalances(sessionId: string, accountUids: string[]): Promise<ProviderBalance[]>;
  fetchTransactions(
    sessionId: string,
    accountUid: string,
    sinceISO: string,
  ): Promise<ProviderTransaction[]>;
}

export class EnableBankingError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Enable Banking API ${status}: ${body}`);
    this.name = "EnableBankingError";
  }
}

/** Schmales Interface, das runSync tatsächlich braucht — beide Provider erfüllen es. */
export type ReadProvider = Pick<BankProvider, "fetchBalances" | "fetchTransactions">;

/** Signalisiert, dass die Bank eine (erneute) TAN-Freigabe verlangt. */
export class NeedTanError extends Error {
  constructor(message = "TAN-Freigabe erforderlich") {
    super(message);
    this.name = "NeedTanError";
  }
}
