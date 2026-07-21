# UI-Nacharbeiten — Spacing, Pie-Chart, Transaktions-Filter

> Kurzer Umsetzungsplan. Drei unabhängige Fixes, jeder einzeln committbar.
> Sprache/Format-Regeln aus dem DS-Plan gelten (du/dein, kein Ausrufezeichen, keine Emojis).

---

## Fix 1: Spacing — Inhalt klebt nicht mehr in der Mitte

**Problem:** `src/app/(app)/layout.tsx` rendert `<main class="mx-auto max-w-6xl …">`.
Auf breiten Monitoren zentriert `mx-auto` die 1152px-Spalte im Platz rechts der
Sidebar. Der Rest teilt sich in eine große Lücke **neben der Sidebar** und eine
große Lücke **rechts**. Genau die zwei Symptome aus dem Feedback.

**Änderung** — nur `src/app/(app)/layout.tsx`, Zeile 12:
- `mx-auto` entfernen → Inhalt linksbündig, hugt die Sidebar (nur noch `--page-pad-x` = 42px Abstand).
- `max-w-6xl` → `max-w-[1440px]` → weniger toter Raum rechts auf breiten Screens.

```tsx
<main className="max-w-[1440px] px-4 py-8 md:px-[var(--page-pad-x)] md:py-[var(--page-pad-y)]">
```

**Prüfen:** Dashboard bei breitem Fenster öffnen. Inhalt startet direkt hinter der
Sidebar, rechts bleibt nur ein moderater Rand.

---

## Fix 2: Pie-Chart wird sichtbar

**Problem:** Der Donut existiert und ist auf `/analysis` eingebunden, aber die
Datenquelle (`src/lib/analytics/queries.ts`, `byCategory`) filtert mit
`isNotNull(transactions.categoryId)`. Da aktuell alles *Nicht kategorisiert* ist,
ist die Slice-Liste leer → der Chart zeigt seinen Leerzustand statt eines Rings.

**Änderung** — `src/lib/analytics/queries.ts` (`byCategory`-Block, ~Z. 82–104):
Einen Sammel-Slice für unkategorisierte Ausgaben ergänzen, damit der Ring
erscheint, sobald es überhaupt Ausgaben gibt — und der User gleichzeitig sieht,
wie viel noch zu kategorisieren ist.
- Zusätzliche Summe über Ausgaben mit `categoryId IS NULL` (ohne Umbuchungen/excluded).
- Als Slice `{ name: "Nicht kategorisiert", color: "var(--uncat)", sumCents }` an `byCategory` anhängen, in die Sortierung einbeziehen.

**Kleinigkeit:** `category-donut.tsx` überschreibt die Slice-Farbe per
`chartColorAt(i)`. Wenn der Uncat-Slice grau (`--uncat`) statt Palettenfarbe sein
soll, dort die Palette nur auf Slices mit `categoryId` anwenden und die
Uncat-Farbe durchreichen. Optional — sonst bekommt er einfach eine Palettenfarbe.

**Prüfen:** `/analysis` öffnen. Donut-Ring sichtbar, Legende zeigt „Nicht
kategorisiert“. Nach dem Kategorisieren einzelner Buchungen splittet sich der Ring.

---

## Fix 3: Transaktionen — Konto-Pillen raus, Betrags-Sortierung rein

**Problem:** Die „zufälligen“ Pillen sind die **Konto-Filter**
(`accounts.length > 1 && accounts.map(...)` in
`src/components/transactions/tx-view.tsx`). Die `__rectest_…__`-Namen sind
Testkonten. Suche + Zeitraum + Richtung + Kategorie decken das Finden bereits ab.

**Entfernen** — `src/components/transactions/tx-view.tsx`:
- Den `accounts.map(...)`-FilterPill-Block.
- Die Konto-Chips im `activeFilters`-`useMemo` (die `for (const id of accountIds)`-Schleife).
- `accountIds`-State und den `accounts`-Prop (auch aus `page.tsx` und dem Query
  in `transactions/page.tsx` entfernen — die `bankAccounts`-Abfrage entfällt).

**Ersetzen durch** — Sortier-Umschalter „Neueste / Größte Beträge“:
- Neuer `SegmentedControl` neben den bestehenden: `{ neueste, betrag }`.
- Neuer optionaler `sort`-Parameter durch `SerializableFilter` →
  `fetchTransactions` → `listTransactions`. Bei `sort: "amount"` nach
  `abs(amountCents) desc` ordnen; passenden Cursor-Schlüssel setzen, damit
  „Mehr laden“ weiter funktioniert (Cursor ist heute datumsbasiert — der
  Amount-Pfad braucht einen eigenen Cursor auf `(abs(amount), id)`).

**Empfehlung:** „Größte Beträge“ als Sortierung umsetzen. „Häufigste“ ist ein
Händler-Konzept und wird bereits von **Analyse → Top-Händler** bedient; im flachen
Buchungs-Feed wäre es irreführend. Wenn dir der Cursor-Umbau zu groß ist:
Fallback = FilterPill „ab 50 €“ (setzt `minEuro`), null Backend-Sortierung.

**Prüfen:** Keine Konto-Pillen mehr. „Größte Beträge“ sortiert die Liste
absteigend nach Betrag, „Mehr laden“ lädt korrekt nach.

---

## Reihenfolge & Commits

1. `fix(ui): Seiteninhalt linksbündig, Spacing korrigiert` — Fix 1 (isoliert, risikoarm)
2. `feat(analysis): unkategorisierte Ausgaben im Donut` — Fix 2
3. `feat(transactions): Konto-Filter entfernt, Betrags-Sortierung` — Fix 3 (größter Umfang)

Nach jedem Fix `npm run build` + Sichtprüfung, dann committen.
