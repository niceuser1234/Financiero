import {
  pgTable,
  pgEnum,
  text,
  bigint,
  boolean,
  date,
  timestamp,
  integer,
  real,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export * from "./auth-schema";

export const providerEnum = pgEnum("provider", ["enable_banking", "csv", "fints"]);
export const connectionStatusEnum = pgEnum("connection_status", ["active", "expired", "revoked"]);
export const accountTypeEnum = pgEnum("account_type", ["checking", "credit_card", "emoney"]);
export const catSourceEnum = pgEnum("categorization_source", ["rule", "llm", "manual", "import", "none"]);
export const categoryKindEnum = pgEnum("category_kind", ["expense", "income", "transfer", "excluded", "saving"]);
export const ruleFieldEnum = pgEnum("rule_field", ["counterparty", "purpose", "fingerprint"]);
export const ruleOpEnum = pgEnum("rule_op", ["equals", "contains", "regex"]);
export const ruleOriginEnum = pgEnum("rule_origin", ["manual", "correction"]);
export const cadenceEnum = pgEnum("cadence", ["weekly", "bimonthly", "monthly", "quarterly", "yearly"]);
export const recurringKindEnum = pgEnum("recurring_kind", ["subscription", "contract", "income", "other", "saving"]);
export const recurringStatusEnum = pgEnum("recurring_status", ["active", "paused", "ended"]);
export const syncTriggerEnum = pgEnum("sync_trigger", ["cron", "manual", "import"]);
export const runStatusEnum = pgEnum("run_status", ["running", "ok", "error"]);

export const connections = pgTable("connections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  provider: providerEnum("provider").notNull(),
  aspspName: text("aspsp_name").notNull(),
  aspspCountry: text("aspsp_country").notNull().default("DE"),
  sessionIdEnc: text("session_id_enc"),
  blz: text("blz"),
  fintsUserId: text("fints_user_id"),
  fintsEndpoint: text("fints_endpoint"),
  fintsProductId: text("fints_product_id"),
  pinEnc: text("pin_enc"),
  fintsStateEnc: text("fints_state_enc"),
  tanMechanism: text("tan_mechanism"),
  status: connectionStatusEnum("status").notNull().default("active"),
  consentValidUntil: timestamp("consent_valid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  connectionId: text("connection_id").references(() => connections.id),
  ebAccountUid: text("eb_account_uid").unique(),
  name: text("name").notNull(),
  ibanMasked: text("iban_masked"),
  type: accountTypeEnum("type").notNull().default("checking"),
  currency: text("currency").notNull().default("EUR"),
  balanceCents: bigint("balance_cents", { mode: "bigint" }),
  balanceUpdatedAt: timestamp("balance_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("circle"),
  color: text("color").notNull().default("#8884d8"),
  kind: categoryKindEnum("kind").notNull().default("expense"),
  sort: integer("sort").notNull().default(0),
});

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fingerprint: text("fingerprint").notNull().unique(),
  nameClean: text("name_clean").notNull(),
  defaultCategoryId: text("default_category_id").references(() => categories.id),
  isSubscriptionHint: boolean("is_subscription_hint").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recurringItems = pgTable(
  "recurring_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    cadence: cadenceEnum("cadence").notNull(),
    kind: recurringKindEnum("kind").notNull().default("subscription"),
    amountLastCents: bigint("amount_last_cents", { mode: "bigint" }).notNull(),
    amountMedianCents: bigint("amount_median_cents", { mode: "bigint" }).notNull(),
    monthlyEquivCents: bigint("monthly_equiv_cents", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull().default("EUR"),
    nextExpectedDate: date("next_expected_date"),
    status: recurringStatusEnum("status").notNull().default("active"),
    priceChangedAt: date("price_changed_at"),
    firstSeen: date("first_seen").notNull(),
    lastSeen: date("last_seen").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("recurring_merchant_cadence").on(t.merchantId, t.cadence)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id").notNull().references(() => bankAccounts.id),
    bookingDate: date("booking_date").notNull(),
    valueDate: date("value_date"),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull().default("EUR"),
    counterpartyName: text("counterparty_name"),
    counterpartyIban: text("counterparty_iban"),
    purpose: text("purpose"),
    merchantId: text("merchant_id").references(() => merchants.id),
    categoryId: text("category_id").references(() => categories.id),
    categorizationSource: catSourceEnum("categorization_source").notNull().default("none"),
    confidence: real("confidence"),
    isTransfer: boolean("is_transfer").notNull().default(false),
    transferPairId: text("transfer_pair_id"),
    recurringItemId: text("recurring_item_id").references(() => recurringItems.id),
    ebEntryRef: text("eb_entry_ref"),
    importHash: text("import_hash").notNull(),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tx_import_hash").on(t.importHash),
    uniqueIndex("tx_eb_ref").on(t.accountId, t.ebEntryRef),
    index("tx_booking").on(t.bookingDate),
    index("tx_account_booking").on(t.accountId, t.bookingDate),
    index("tx_category").on(t.categoryId),
  ],
);

export const categoryRules = pgTable("category_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  priority: integer("priority").notNull().default(100),
  field: ruleFieldEnum("field").notNull(),
  op: ruleOpEnum("op").notNull(),
  value: text("value").notNull(),
  categoryId: text("category_id").notNull().references(() => categories.id),
  createdFrom: ruleOriginEnum("created_from").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncRuns = pgTable("sync_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trigger: syncTriggerEnum("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: runStatusEnum("status").notNull().default("running"),
  stats: jsonb("stats"),
  error: text("error"),
});

export const llmRuns = pgTable("llm_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  batchId: text("batch_id").notNull(),
  model: text("model").notNull(),
  itemCount: integer("item_count").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  status: runStatusEnum("status").notNull().default("running"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fxRates = pgTable(
  "fx_rates",
  {
    date: date("date").notNull(),
    currency: text("currency").notNull(),
    rateToEur: real("rate_to_eur").notNull(),
  },
  (t) => [uniqueIndex("fx_date_ccy").on(t.date, t.currency)],
);

export type Connection = typeof connections.$inferSelect;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type Merchant = typeof merchants.$inferSelect;
export type RecurringItem = typeof recurringItems.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type CategoryRule = typeof categoryRules.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
