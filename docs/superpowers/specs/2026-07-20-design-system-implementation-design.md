# Financiero Design System — Implementierungs-Spec

**Datum:** 2026-07-20
**Status:** Freigegeben (Design)
**Scope:** Vollständige Umsetzung des gelieferten Design Systems auf die bestehende App — Tokens, UI-Primitives, neue DS-Komponenten, Umbau der 5 Screens. Reine Präsentationsschicht.

## Ziel & Kontext

Das Design System liegt als Handoff-Paket unter [`Design-System/`](../../../Design-System/) (ZIP, entpackt nach `Design-System/unpacked/financiero-design-system/project/`). Es definiert eine "Soft Depth"-Richtung: weiße Karten mit weicher Elevation auf warmem Creme, **Marine `#223A7A` als einzige Aktionsfarbe**, Grün/Rot ausschließlich für Einnahmen/Ausgaben, Space Grotesk für Displayzahlen.

**Zentraler Befund:** Die App ist strukturell bereits sehr nah am DS. Die Informationsarchitektur, die das DS-Readme als "preserve exactly" markiert, ist in der App schon exakt so umgesetzt:

| DS-Vorgabe | Stand in der App |
|---|---|
| Nav: Dashboard · Transaktionen · Verträge · Analyse · Einstellungen | [`app-nav.tsx`](../../../src/components/app-nav.tsx) — identisch, inkl. Bottom-Tabs mobil |
| Lucide-Stroke-Icons | bereits `lucide-react`, gleiche Glyphen (`layout-dashboard`, `arrow-left-right`, `repeat`, `pie-chart`, `settings`) |
| KPI-Reihe mit Eyebrow + großer Zahl | [`stat-tile.tsx`](../../../src/components/stat-tile.tsx) — gleiche Anatomie, andere Optik |
| Deutsch, "du"-Ansprache | durchgehend vorhanden ("Überblick über deine Finanzen.") |
| Deutsches Geldformat | [`money.ts`](../../../src/lib/money.ts) via `Intl` de-DE |

Es ist also **kein Neubau, sondern ein Re-Skin plus Anatomie-Upgrade**. Server Actions, DB-Schema, Banking/FinTS und Klassifizierung bleiben unangetastet.

**Gegenbefund:** Der Dark Mode der App ist toter Code — kein `ThemeProvider`, kein Toggle, nur `sonner` importiert `next-themes`. Der `.dark`-Block in `globals.css` und 23 `dark:`-Utilities laufen ins Leere.

## Getroffene Entscheidungen

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Tiefe | **Tokens + Primitives + Screens** | Nur-Tokens würde die shadcn-Default-Anatomie sichtbar lassen; das DS definiert eigene Komponenten-Anatomien (KpiCard, TransactionRow, Sidebar-Pille), die ohne Screen-Umbau nicht zur Geltung kommen. |
| Token-Strategie | **DS-Tokens wörtlich + Bridge auf shadcn-Namen** | Jede bestehende Komponente funktioniert unverändert weiter — nichts bricht still. DS-Vokabular bleibt Wahrheit, shadcn wird Alias. |
| Dark Mode | **Streichen, Light-only** | DS ist explizit Light-only. Eine Dark-Variante wäre erfundene Werte, nicht das gelieferte System. Aktuell ohnehin nicht verdrahtet. |
| Fonts | **Geist (UI) + Space Grotesk (Display)** | Das DS-Readme flaggt Inter als Notlösung — gewünscht war Geist/General Sans. Geist ist bereits self-hosted via `next/font` eingebunden. Ergebnis: näher am Design-Intent *und* ein Netzwerk-Request weniger. |
| Minuszeichen | **U+2212 in `formatCents`** | DS schreibt `−9,99 €` vor. Einziger Eingriff außerhalb der Präsentationsschicht; `money.test.ts` wird mitgezogen. |
| Enable-Banking-/FinTS-UI | **Wird mitgestylt, nicht umgebaut** | Setup-Flows sind nicht Teil der 5 DS-Screens; sie erben Tokens und Primitives, behalten aber ihr Layout. |

## Architektur — 5 Schichten

Aufbau von unten nach oben, jede Schicht für sich verifizierbar.

```
⑤ Screens        dashboard · transactions · contracts · analysis · settings
                 (IA unverändert, Layout nach ui_kits/financiero/)
      ▲
④ DS-Primitives  src/components/ds/ — KpiCard, TransactionRow, Money,
                 MerchantAvatar, FilterPill, FilterChip, SegmentedControl, EmptyState
      ▲
③ shadcn-UI      src/components/ui/ — Button, Card, Badge, Input, Tabs, Table …
                 auf DS-Anatomie nachgezogen, Namen/Props unverändert
      ▲
② Fonts          layout.tsx — Geist + Space Grotesk via next/font
      ▲
① Tokens         globals.css — DS-Tokens wörtlich + Bridge auf shadcn-Namen
```

### ① Token-Layer

Quelle: `Design-System/unpacked/financiero-design-system/project/tokens/*.css`. Die DS-Tokens werden **wörtlich** nach `:root` in [`globals.css`](../../../src/app/globals.css) übernommen — gleiche Namen, gleiche Werte, gleiche Kommentare. Kein Umbenennen, keine oklch-Konvertierung.

Darüber eine Bridge-Sektion, die die shadcn-Semantik auf DS-Tokens mappt:

```css
--background: var(--bg);
--foreground: var(--ink-900);
--card: var(--surface);
--primary: var(--accent);
--primary-foreground: var(--accent-fg);
--muted-foreground: var(--ink-500);
--border: var(--hairline);
--ring: var(--accent-ring);
--destructive: var(--expense);
```

Weitere Änderungen in dieser Datei:
- `.dark`-Block und `@custom-variant dark` entfernen.
- Radius-Leiter auf DS-Festwerte: `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`, `--radius-xl: 18px` statt der `calc()`-Kette über `--radius: 0.625rem`.
- `@theme inline` erweitern um `--font-display`, `--color-income`, `--color-expense`, `--color-review`, `--color-chart-6/7/8`.

### ② Fonts

`Space_Grotesk` aus `next/font/google` in [`layout.tsx`](../../../src/app/layout.tsx) ergänzen, gebunden an `--font-display`. Geist bleibt `--font-sans`, Geist Mono bleibt `--font-mono`. Utility `.font-display` plus `tabular-nums` für Geldwerte.

### ③ shadcn-Primitives

Bestehende Dateien in [`src/components/ui/`](../../../src/components/ui/) werden retuned — **Dateinamen, Exports und Props bleiben identisch**, damit keine Aufrufstelle bricht. Exakte Werte werden beim Implementieren aus den jeweiligen `components/**/​*.jsx` des DS gehoben.

| Komponente | Anpassung |
|---|---|
| `button.tsx` | 4 Varianten nach DS: primary = Marine + `--shadow-accent`; secondary = weiß + `--hairline-strong` + `--shadow-xs`; ghost; danger = weiß + `--expense`. Radius `md`. Kein Shrink beim Press. |
| `card.tsx` | Radius `lg` (16px), `--shadow-md`, **plus** 1px `--hairline` (der gelieferte `Card.jsx` setzt beides immer — nicht "borderlos"). Padding `--card-pad` (24px). |
| `badge.tsx` | Pill-Radius, `--*-soft-bg`-Töne für income/expense/review/uncat. |
| `input.tsx` | Radius `md`, `--surface-raised`, Fokusring 2–3px `--accent-ring`. |
| `tabs.tsx` | Optik des DS-`SegmentedControl`: **weißer** Container (`--surface`, 1px `--hairline`, `--shadow-sm`, Radius `md`, 4px Innenpadding), aktives Segment **marine-gefüllt** mit `--shadow-accent`, Radius `sm`. |
| `table.tsx` | Zeilenpadding `--row-pad-y` (14px), Hairline-Trenner, Beträge rechtsbündig tabular. |
| `select`, `dropdown-menu`, `dialog`, `sheet`, `skeleton` | Radien, Schatten, Hover auf `--surface-hover` ziehen. |

Alle 23 `dark:`-Utilities entfallen dabei (verteilt über `ui/`, `stat-tile.tsx`, `dashboard/page.tsx`, `analysis-view.tsx`, `contracts-view.tsx`, `trend-bars.tsx`, `tx-view.tsx`, `connections/page.tsx`).

### ④ Neue DS-Primitives

Neues Verzeichnis `src/components/ds/`. Jede Komponente wird aus ihrem DS-Pendant portiert (Inline-Styles → Tailwind/Token-Klassen), Props nach der mitgelieferten `.d.ts`.

| Komponente | Zweck | DS-Quelle |
|---|---|---|
| `KpiCard` | Uppercase-Eyebrow (`--tracking-label`), Space-Grotesk-Wert, getönter Grund bei income/expense. **Löst `stat-tile.tsx` ab.** | `components/surfaces/KpiCard.jsx` |
| `TransactionRow` | Merchant-Avatar, Name + Kategorie, Repeat-Glyph bei Wiederkehrern, rechtsbündiger Tabular-Betrag mit Tone | `components/data/TransactionRow.jsx` |
| `MerchantAvatar` | Getöntes Rounded-Square mit Initiale. Explizit **keine** gefetchten Logos. | ebd. |
| `Money` | Rendert Cents nach DS-Regeln: tabular, rechtsbündig, Space Grotesk. **Tone: Einnahmen `--income` (grün), Ausgaben `--ink-900` (neutral)** | `TransactionRow.jsx` |
| `FilterPill` / `FilterChip` | Filter-Auswahl bzw. entfernbarer aktiver Filter | `components/controls/` |
| `SegmentedControl` | Zeitraum-/Status-Umschalter | `components/controls/SegmentedControl.jsx` |
| `EmptyState` | Icon + Titel + Lead, "du"-Ansprache | `components/surfaces/EmptyState.jsx` |

Charts: [`category-donut.tsx`](../../../src/components/charts/category-donut.tsx) und [`trend-bars.tsx`](../../../src/components/charts/trend-bars.tsx) bleiben auf Recharts, werden aber auf `--chart-1..8` umgefärbt; Donut bekommt die Mittelsumme, Bars die income/expense-Semantik.

Navigation: `app-nav.tsx` — aktiver Zustand wird gefüllte Marine-Pille mit `--shadow-accent` (statt `bg-primary/10`), inaktiv `--ink-500` mit `--surface-hover` beim Hover.

### ⑤ Screens

Umbau nach `ui_kits/financiero/` bei **unveränderter IA**:

| Route | Sollzustand |
|---|---|
| `/dashboard` | KPI-Reihe als `KpiCard` — Gesamtsaldo `tone="accent"` (marine gefüllt), Einnahmen `tone="income"`, Ausgaben `tone="expense"`, Abos `tone="neutral"`; darunter Donut + Konten, dann Letzte Umsätze + Anstehende Abbuchungen; "Jetzt synchronisieren" im Header |
| `/transactions` | Suchfeld, Filter, aktive Filter-Chips, Datumsgruppen mit `TransactionRow`, Summenzeile |
| `/contracts` | Summary-Card (pro Monat / N aktiv), `SegmentedControl` Aktiv/Einnahmen/Beendet, Vertragskarten |
| `/analysis` | Zeitraum-Toggle (Monat/3 Monate/1 Jahr), KPI Einnahmen/Ausgaben, Donut, Bars 6 Monate, Top-Händler |
| `/settings` (+ `connections`, `import`, `review`, `fints`) | Erben Tokens und Primitives; Layout bleibt |

Shell in [`(app)/layout.tsx`](../../../src/app/%28app%29/layout.tsx): Creme-Grund, Gutter nach `--page-pad-x/y` (42/38px desktop), Sidebar `--sidebar-w` (240px).

## Nicht im Scope

- Server Actions, DB-Schema, Drizzle-Queries, Banking/FinTS-Logik, Klassifizierungspipeline.
- Dark Mode in jeder Form.
- Logo-Asset — das DS liefert keins, nur eine Wortmarke (`guidelines/brand-wordmark.html`).
- Die `explorations/`-Dateien des DS (laut Readme ausdrücklich nicht Teil des Systems).
- `_ds_bundle.js` / `window.FinancieroDesignSystem_*` — die Komponenten werden portiert, nicht als Bundle eingebunden.

## Risiken

| Risiko | Umgang |
|---|---|
| Bridge-Mapping trifft eine shadcn-Variable nicht → Komponente fällt auf Default zurück | Nach Schicht ① jede `--*`-Variable aus dem alten `:root` gegen die Bridge prüfen; keine darf ungemappt bleiben |
| `formatCents`-Änderung bricht Round-Trip mit `parseGermanAmount` | `parseGermanAmount` normalisiert U+2212 bereits; Round-Trip-Test in `money.test.ts` ergänzen |
| Screen-Umbau verändert versehentlich die IA | Reihenfolge und Benennung der Abschnitte gegen die Tabelle in ⑤ prüfen |
| Keine visuellen Tests vorhanden | Verifikation läuft manuell über die laufende App, nicht nur über den Build |

## Verifikation

1. `npm run build` — grün
2. `npm run lint` — grün
3. `npm test` — grün
4. App starten und **alle 5 Screens durchklicken** — Light-Darstellung, Marine-Aktivzustände, Tabular-Beträge, Charts in DS-Farben
5. `grep -rn "dark:" src/` — leer
6. Mobile-Breakpoint: Bottom-Tabs und KPI-Stapelung prüfen
