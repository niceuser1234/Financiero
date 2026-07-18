"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Repeat, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { CategoryPicker } from "./category-picker";
import {
  fetchTransactions,
  recategorize,
  type PickerCategory,
  type SerializableFilter,
  type TxDTO,
  type TxPage,
} from "@/lib/transactions/actions";

type Account = { id: string; name: string };

const DATE_PRESETS: { label: string; days: number | null }[] = [
  { label: "30 Tage", days: 30 },
  { label: "3 Monate", days: 90 },
  { label: "1 Jahr", days: 365 },
  { label: "Alle", days: null },
];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

export function TxView({
  initialPage,
  accounts,
  categories,
  baseFilter,
}: {
  initialPage: TxPage;
  accounts: Account[];
  categories: PickerCategory[];
  baseFilter?: Partial<SerializableFilter>;
}) {
  const [q, setQ] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [presetDays, setPresetDays] = useState<number | null>(90);
  const [includeTransfers, setIncludeTransfers] = useState(false);

  const [page, setPage] = useState<TxPage>(initialPage);
  const [items, setItems] = useState<TxDTO[]>(initialPage.items);
  const [selected, setSelected] = useState<TxDTO | null>(null);
  const [pending, startTransition] = useTransition();
  const firstRender = useRef(true);

  const filter: SerializableFilter = useMemo(
    () => ({
      ...baseFilter,
      q: q || undefined,
      accountIds: accountIds.length ? accountIds : undefined,
      categoryIds: categoryId ? [categoryId] : undefined,
      direction: direction === "all" ? undefined : direction,
      from: presetDays ? isoDaysAgo(presetDays) : undefined,
      includeTransfers,
      limit: 50,
    }),
    [q, accountIds, categoryId, direction, presetDays, includeTransfers, baseFilter],
  );

  // Bei Filteränderung Seite 1 neu laden (Suche debounced).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        const p = await fetchTransactions(filter);
        setPage(p);
        setItems(p.items);
      });
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [filter, q]);

  function loadMore() {
    if (!page.nextCursor) return;
    startTransition(async () => {
      const p = await fetchTransactions({ ...filter, cursor: page.nextCursor! });
      setPage(p);
      setItems((prev) => [...prev, ...p.items]);
    });
  }

  const grouped = useMemo(() => groupByDate(items), [items]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Suche Händler oder Verwendungszweck…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          options={[
            { v: "all", l: "Alle" },
            { v: "out", l: "Ausgaben" },
            { v: "in", l: "Einnahmen" },
          ]}
          value={direction}
          onChange={(v) => setDirection(v as typeof direction)}
        />
        <ToggleGroup
          options={DATE_PRESETS.map((p) => ({ v: String(p.days), l: p.label }))}
          value={String(presetDays)}
          onChange={(v) => setPresetDays(v === "null" ? null : Number(v))}
        />
        <CategoryPicker
          categories={categories}
          value={categoryId}
          onChange={(id) => setCategoryId((cur) => (cur === id ? null : id))}
          triggerLabel={categoryId ? categories.find((c) => c.id === categoryId)?.name : "Alle Kategorien"}
        />
        {categoryId && (
          <Button variant="ghost" size="sm" onClick={() => setCategoryId(null)}>
            ✕ Kategorie
          </Button>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={includeTransfers} onChange={(e) => setIncludeTransfers(e.target.checked)} />
          Umbuchungen
        </label>
      </div>

      {accounts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => {
            const active = accountIds.includes(a.id);
            return (
              <Button
                key={a.id}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setAccountIds((cur) => (active ? cur.filter((x) => x !== a.id) : [...cur, a.id]))
                }
              >
                {a.name}
              </Button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-2 text-sm">
        <span className="text-muted-foreground">{page.count} Buchungen</span>
        <span className="font-medium tabular-nums">Σ {page.sumFmt}</span>
      </div>

      <div className="space-y-6">
        {grouped.map(([date, rows]) => (
          <div key={date}>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {formatDate(date)}
            </div>
            <div className="divide-y rounded-md border">
              {rows.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
                >
                  <span
                    className="size-8 shrink-0 rounded-full"
                    style={{ background: (t.categoryColor ?? "#94a3b8") + "33" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate font-medium">
                      {t.merchantName ?? t.counterpartyName ?? "Unbekannt"}
                      {t.recurringItemId && <Repeat className="size-3 text-muted-foreground" />}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {t.categoryName ?? "Nicht kategorisiert"}
                    </span>
                  </span>
                  <span
                    className={
                      "shrink-0 tabular-nums font-medium " +
                      (t.negative ? "text-foreground" : "text-emerald-600 dark:text-emerald-400")
                    }
                  >
                    {t.amountFmt}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Keine Buchungen für diese Auswahl.</p>
        )}
      </div>

      {page.nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={pending}>
            {pending ? "Lädt…" : "Mehr laden"}
          </Button>
        </div>
      )}

      <DetailSheet
        tx={selected}
        categories={categories}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          startTransition(async () => {
            const p = await fetchTransactions(filter);
            setPage(p);
            setItems(p.items);
          });
        }}
      />
    </div>
  );
}

function DetailSheet({
  tx,
  categories,
  onClose,
  onSaved,
}: {
  tx: TxDTO | null;
  categories: PickerCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [catId, setCatId] = useState<string | null>(null);
  const [createRule, setCreateRule] = useState(true);
  const [applyPast, setApplyPast] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCatId(tx?.categoryId ?? null);
    setCreateRule(true);
    setApplyPast(false);
  }, [tx]);

  async function save() {
    if (!tx || !catId) return;
    setSaving(true);
    try {
      const res = await recategorize({ txId: tx.id, categoryId: catId, createRule, applyPast });
      toast.success(`Kategorisiert (${res.updated} Buchung${res.updated === 1 ? "" : "en"})`);
      onSaved();
    } catch (e) {
      toast.error("Fehlgeschlagen", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!tx} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto">
        {tx && (
          <>
            <SheetHeader>
              <SheetTitle>{tx.merchantName ?? tx.counterpartyName ?? "Buchung"}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-8">
              <div className="text-2xl font-semibold tabular-nums">{tx.amountFmt}</div>
              <dl className="space-y-1.5 text-sm">
                <Row label="Datum" value={formatDate(tx.bookingDate)} />
                <Row label="Gegenpartei" value={tx.counterpartyName ?? "–"} />
                <Row label="Verwendungszweck" value={tx.purpose ?? "–"} />
                <Row label="Kategorie" value={tx.categoryName ?? "Nicht kategorisiert"} />
                <Row
                  label="Quelle"
                  value={
                    <span className="flex items-center gap-1.5">
                      {sourceLabel(tx.categorizationSource)}
                      {tx.confidence != null && (
                        <Badge variant="secondary">{Math.round(tx.confidence * 100)}%</Badge>
                      )}
                    </span>
                  }
                />
                {tx.isTransfer && <Row label="Typ" value={<Badge variant="secondary">Umbuchung</Badge>} />}
              </dl>

              <div className="space-y-2 border-t pt-4">
                <Label>Kategorie ändern</Label>
                <div className="flex flex-col gap-2">
                  <CategoryPicker categories={categories} value={catId} onChange={setCatId} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={createRule} onChange={(e) => setCreateRule(e.target.checked)} />
                    Regel für diesen Händler anlegen
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={applyPast} onChange={(e) => setApplyPast(e.target.checked)} />
                    Auf vergangene Buchungen anwenden
                  </label>
                </div>
                <Button onClick={save} disabled={saving || !catId} className="mt-2 w-full">
                  {saving ? "Speichert…" : "Speichern"}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function ToggleGroup({
  options,
  value,
  onChange,
}: {
  options: { v: string; l: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={
            "rounded px-2.5 py-1 text-sm transition-colors " +
            (value === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
          }
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function groupByDate(items: TxDTO[]): Array<[string, TxDTO[]]> {
  const map = new Map<string, TxDTO[]>();
  for (const t of items) {
    const arr = map.get(t.bookingDate) ?? [];
    arr.push(t);
    map.set(t.bookingDate, arr);
  }
  return [...map.entries()];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function sourceLabel(s: string): string {
  return { rule: "Regel", llm: "KI", manual: "Manuell", import: "Import", none: "–" }[s] ?? s;
}
