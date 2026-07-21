"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDownWideNarrow, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { FilterPill, FilterChip } from "@/components/ds/filter-pill";
import { SegmentedControl } from "@/components/ds/segmented-control";
import { EmptyState } from "@/components/ds/empty-state";
import { TransactionRow } from "@/components/ds/transaction-row";
import { Money } from "@/components/ds/money";
import { formatCents } from "@/lib/money";
import { CategoryPicker } from "./category-picker";
import {
  fetchTransactions,
  recategorize,
  type PickerCategory,
  type SerializableFilter,
  type TxDTO,
  type TxPage,
} from "@/lib/transactions/actions";

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
  categories,
  baseFilter,
}: {
  initialPage: TxPage;
  categories: PickerCategory[];
  baseFilter?: Partial<SerializableFilter>;
}) {
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [presetDays, setPresetDays] = useState<number | null>(90);
  const [includeTransfers, setIncludeTransfers] = useState(false);
  const [sort, setSort] = useState<"date" | "amount">("date");

  const [page, setPage] = useState<TxPage>(initialPage);
  const [items, setItems] = useState<TxDTO[]>(initialPage.items);
  const [selected, setSelected] = useState<TxDTO | null>(null);
  const [pending, startTransition] = useTransition();
  const firstRender = useRef(true);

  const filter: SerializableFilter = useMemo(
    () => ({
      ...baseFilter,
      q: q || undefined,
      categoryIds: categoryId ? [categoryId] : undefined,
      direction: direction === "all" ? undefined : direction,
      from: presetDays ? isoDaysAgo(presetDays) : undefined,
      includeTransfers,
      sort: sort === "date" ? undefined : sort,
      limit: 50,
    }),
    [q, categoryId, direction, presetDays, includeTransfers, sort, baseFilter],
  );

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

  const activeFilters = useMemo(() => {
    const chips: { key: string; label?: string; value: string; clear: () => void }[] = [];
    if (direction !== "all") {
      chips.push({
        key: "direction",
        label: "Richtung",
        value: direction === "in" ? "Einnahmen" : "Ausgaben",
        clear: () => setDirection("all"),
      });
    }
    if (presetDays !== 90) {
      const label = DATE_PRESETS.find((p) => p.days === presetDays)?.label ?? "Zeitraum";
      chips.push({
        key: "preset",
        label: "Zeitraum",
        value: label,
        clear: () => setPresetDays(90),
      });
    }
    if (categoryId) {
      chips.push({
        key: "category",
        label: "Kategorie",
        value: categories.find((c) => c.id === categoryId)?.name ?? "Kategorie",
        clear: () => setCategoryId(null),
      });
    }
    if (includeTransfers) {
      chips.push({
        key: "transfers",
        value: "Umbuchungen",
        clear: () => setIncludeTransfers(false),
      });
    }
    if (sort !== "date") {
      chips.push({
        key: "sort",
        label: "Sortierung",
        value: "Größte Beträge",
        clear: () => setSort("date"),
      });
    }
    if (q.trim()) {
      chips.push({
        key: "q",
        label: "Suche",
        value: q.trim(),
        clear: () => setQ(""),
      });
    }
    return chips;
  }, [direction, presetDays, categoryId, includeTransfers, sort, categories, q]);

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:w-[320px]">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-ink-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Umsätze durchsuchen …"
          className="pl-10"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          size="sm"
          options={[
            { value: "all", label: "Alle" },
            { value: "out", label: "Ausgaben" },
            { value: "in", label: "Einnahmen" },
          ] as const}
          value={direction}
          onChange={setDirection}
        />
        <SegmentedControl
          size="sm"
          options={DATE_PRESETS.map((p) => ({ value: String(p.days), label: p.label }))}
          value={String(presetDays)}
          onChange={(v) => setPresetDays(v === "null" ? null : Number(v))}
        />
        <CategoryPicker
          categories={categories}
          value={categoryId}
          onChange={(id) => setCategoryId((cur) => (cur === id ? null : id))}
          triggerLabel={
            categoryId ? categories.find((c) => c.id === categoryId)?.name : "Kategorie"
          }
          trigger={
            <FilterPill active={!!categoryId} dropdown icon={SlidersHorizontal}>
              {categoryId ? categories.find((c) => c.id === categoryId)?.name : "Kategorie"}
            </FilterPill>
          }
        />
        <FilterPill
          active={includeTransfers}
          onClick={() => setIncludeTransfers((v) => !v)}
        >
          Umbuchungen
        </FilterPill>
        <FilterPill
          active={sort === "amount"}
          icon={ArrowDownWideNarrow}
          onClick={() => setSort((v) => (v === "amount" ? "date" : "amount"))}
        >
          Größte Beträge
        </FilterPill>
      </div>

      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {activeFilters.map((f) => (
            <FilterChip key={f.key} label={f.label} value={f.value} onRemove={() => f.clear()} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between rounded-md bg-surface-sunken px-4 py-2 text-sm">
        <span className="text-ink-500">{page.count} Buchungen</span>
        <Money.Text value={page.sumFmt} className="text-sm" />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Keine Umsätze gefunden"
          message="Passe die Filter an oder importiere eine CSV-Datei."
        />
      ) : (
        <div>
          {grouped.map(([date, rows]) => {
            const groupSum = rows.reduce((s, t) => s + t.amountCents, 0);
            const groupSumFmt = formatCents(BigInt(groupSum));
            return (
              <div key={date}>
                <div className="mt-6 mb-1 px-3 text-[11px] font-semibold tracking-[var(--tracking-label)] text-ink-400 uppercase first:mt-0">
                  {formatDate(date)}
                </div>
                <div>
                  {rows.map((t) => (
                    <TransactionRow
                      key={t.id}
                      name={t.merchantName ?? t.counterpartyName ?? t.purpose ?? "Unbekannt"}
                      meta={`${t.categoryName ?? "Nicht kategorisiert"} · ${formatShortDate(t.bookingDate)}`}
                      amount={t.amountFmt}
                      tone={t.negative ? "neutral" : "income"}
                      category={t.categoryName}
                      categoryTone={t.negative ? "secondary" : "income"}
                      uncategorized={!t.categoryId && !t.isTransfer}
                      review={t.confidence != null && t.confidence < 0.7}
                      recurring={t.recurringItemId != null}
                      onClick={() => setSelected(t)}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-hairline px-3 py-3">
                  <span className="text-[13px] font-medium text-ink-500">Summe</span>
                  <Money.Text value={groupSumFmt} className="min-w-[104px] text-right" />
                </div>
              </div>
            );
          })}
        </div>
      )}

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
  return (
    <Sheet open={!!tx} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto">
        {tx && (
          <DetailSheetBody
            key={tx.id}
            tx={tx}
            categories={categories}
            onSaved={onSaved}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailSheetBody({
  tx,
  categories,
  onSaved,
}: {
  tx: TxDTO;
  categories: PickerCategory[];
  onSaved: () => void;
}) {
  const [catId, setCatId] = useState<string | null>(tx.categoryId);
  const [createRule, setCreateRule] = useState(true);
  const [applyPast, setApplyPast] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!catId) return;
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
    <>
      <SheetHeader>
        <SheetTitle>{tx.merchantName ?? tx.counterpartyName ?? "Buchung"}</SheetTitle>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-8">
        <Money.Text
          value={tx.amountFmt}
          tone={tx.negative ? "neutral" : "income"}
          className="text-2xl"
        />
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

        <div className="space-y-2 border-t border-hairline pt-4">
          <Label>Kategorie ändern</Label>
          <div className="flex flex-col gap-2">
            <CategoryPicker categories={categories} value={catId} onChange={setCatId} />
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={createRule} onChange={(e) => setCreateRule(e.target.checked)} />
              Regel für diesen Händler anlegen
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
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
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className="text-right text-ink-900">{value}</dd>
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
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function sourceLabel(s: string): string {
  return { rule: "Regel", llm: "KI", manual: "Manuell", import: "Import", none: "–" }[s] ?? s;
}
