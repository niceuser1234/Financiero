# Financiero Design System — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das gelieferte Financiero Design System vollständig auf die App anwenden — Tokens, UI-Primitives, neue DS-Komponenten, Umbau der 5 Screens.

**Architecture:** Fünf Schichten von unten nach oben. Die DS-Tokens kommen wörtlich nach `:root`; eine Bridge mappt die shadcn-Semantik darauf, wodurch bestehende Komponenten ohne Änderung DS-konform werden. Darüber chirurgische Edits an den base-nova-Primitives, dann neue DS-Komponenten unter `src/components/ds/`, zuletzt der Screen-Umbau.

**Tech Stack:** Next.js 16.2.10 (App Router, RSC), React 19.2.4, Tailwind v4 (`@theme inline`), shadcn base-nova auf `@base-ui/react`, lucide-react, recharts, Vitest (node-Environment).

## Global Constraints

- **Sprache:** Deutsch, informelles "du/dein". Sentence case. **Keine Ausrufezeichen. Niemals Emojis.**
- **Geldformat:** `1.043,72 €` — Tausenderpunkt, Dezimalkomma, Leerzeichen vor €. Negativ mit **U+2212** (`−`), nicht ASCII-Hyphen. Immer `tabular-nums`, in Zeilen/Tabellen rechtsbündig.
- **Genau eine Akzentfarbe:** Marine `--accent`. Grün/Rot ausschließlich für Einnahmen/Ausgaben-Semantik.
- **Beträge:** Einnahmen `--income` (grün), Ausgaben `--ink-900` (neutral, **nicht** rot). Rot ist nur Label-/Tint-Farbe.
- **Light-only.** Kein `dark:` irgendwo in `src/`. Kein `.dark`-Block.
- **Icons:** ausschließlich `lucide-react`, Strokewidth 1.75 (aktiv 2).
- **Quelle der Wahrheit für exakte Werte:** `Design-System/unpacked/financiero-design-system/project/`. Bei Konflikt zwischen `readme.md` und Komponenten-Code **gewinnt der Komponenten-Code**.
- Keine Änderungen an DB-Schema, Server Actions, Banking/FinTS, Klassifizierung — **außer** `money.ts` (Task 2).
- Nach jeder Task committen.

---

## File Structure

**Neu:**
| Datei | Verantwortung |
|---|---|
| `src/lib/ds/format.ts` | Pure Helper: Initiale, Tone-Ableitung, Chart-Farbindex |
| `src/lib/ds/format.test.ts` | Tests dazu |
| `src/components/ds/money.tsx` | Betragsdarstellung (tabular, Tone) |
| `src/components/ds/merchant-avatar.tsx` | Getöntes Quadrat mit Initiale |
| `src/components/ds/kpi-card.tsx` | KPI-Kachel, 4 Tones |
| `src/components/ds/transaction-row.tsx` | Transaktionszeile |
| `src/components/ds/filter-pill.tsx` | Filter-Pille + Filter-Chip |
| `src/components/ds/segmented-control.tsx` | Segment-Umschalter |
| `src/components/ds/empty-state.tsx` | Leerzustand |

**Geändert:** `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/lib/money.ts`, `src/lib/money.test.ts`, `src/components/app-nav.tsx`, `src/components/page-header.tsx`, `src/components/ui/{button,card,badge,input,tabs,select,dropdown-menu,dialog,sheet,table,skeleton}.tsx`, `src/components/charts/{category-donut,trend-bars}.tsx`, die 5 Screens + Settings-Unterseiten.

**Entfernt:** `src/components/stat-tile.tsx` (geht in `kpi-card.tsx` auf).

---

## Task 1: Token-Layer und Fonts

**Files:**
- Modify: `src/app/globals.css` (Vollersatz)
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: CSS-Variablen `--bg --surface --surface-raised --surface-sunken --surface-hover --ink-900/700/500/400/300 --hairline --hairline-strong --accent --accent-hover --accent-active --accent-fg --accent-soft --accent-ring --income --income-mid --income-soft-bg --expense --expense-strong --expense-soft-bg --uncat --uncat-soft-bg --review --review-mid --review-soft-bg --chart-1..8 --shadow-xs/sm/md/lg/accent --ease-out --dur-fast --dur --font-display --sidebar-w --card-pad --page-pad-x --page-pad-y --row-pad-y --tracking-label`
- Produces: Tailwind-Utilities `font-display`, `text-income`, `text-expense`, `bg-income-soft`, `bg-expense-soft`, `bg-review-soft`, `bg-uncat-soft`, `shadow-ds-md`, `shadow-ds-accent`, `rounded-{sm,md,lg,xl}` = 8/12/16/18px

- [ ] **Step 1: `globals.css` vollständig ersetzen**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* ==========================================================================
   Financiero Design System — Tokens
   Quelle: Design-System/unpacked/financiero-design-system/project/tokens/
   Wörtlich übernommen. Nicht umbenennen, nicht nach oklch konvertieren.
   ========================================================================== */
:root {
  /* --- Warme neutrale Flächen --- */
  --bg: #FBF8F1;
  --surface: #FFFFFF;
  --surface-raised: #FFFEFB;
  --surface-sunken: #F1ECE1;
  --surface-hover: #F5F1E7;

  /* --- Ink (warm-neutraler Text) --- */
  --ink-900: #161A22;
  --ink-700: #3A3F4A;
  --ink-500: #666B76;
  --ink-400: #8A8F9A;
  --ink-300: #AEB2BB;

  /* --- Haarlinien --- */
  --hairline: #E6E4DD;
  --hairline-strong: #D8D6CD;

  /* --- Akzent: Marine (die einzige Aktionsfarbe) --- */
  --accent: #223A7A;
  --accent-hover: #1B2F63;
  --accent-active: #16264F;
  --accent-fg: #FFFFFF;
  --accent-soft: #E6EAF4;
  --accent-soft-fg: #223A7A;
  --accent-ring: rgba(34, 58, 122, .32);

  /* --- Semantik: Einnahmen --- */
  --income: #1E6B48;
  --income-mid: #3E8E6E;
  --income-soft-bg: #E7F0EA;

  /* --- Semantik: Ausgaben --- */
  --expense: #C0322B;
  --expense-strong: #A32B23;
  --expense-soft-bg: #F6E7E5;

  /* --- Semantik: nicht kategorisiert --- */
  --uncat: #8A8F9A;
  --uncat-soft-bg: #ECEBE6;

  /* --- Semantik: Prüfen nötig --- */
  --review: #9C6F1B;
  --review-mid: #B4801F;
  --review-soft-bg: #F6EEDA;

  /* --- Chart-Palette (8 Kategorien, kein Lila/Mint) --- */
  --chart-1: #223A7A;
  --chart-2: #3E64B0;
  --chart-3: #8CA0CE;
  --chart-4: #D99A5A;
  --chart-5: #BE7B5A;
  --chart-6: #6E7B8A;
  --chart-7: #B39A5E;
  --chart-8: #7E8F73;

  /* --- Radien --- */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 18px;
  --radius-pill: 999px;

  /* --- Elevation: warm, weich, diffus --- */
  --shadow-xs: 0 1px 2px rgba(22, 26, 34, .05);
  --shadow-sm: 0 2px 8px rgba(22, 26, 34, .06);
  --shadow-md: 0 8px 24px rgba(27, 31, 39, .07);
  --shadow-lg: 0 16px 40px rgba(27, 31, 39, .10);
  --shadow-accent: 0 6px 16px rgba(34, 58, 122, .26);

  /* --- Motion --- */
  --ease-out: cubic-bezier(.2, .7, .3, 1);
  --dur-fast: 120ms;
  --dur: 180ms;

  /* --- Typografie --- */
  --font-display: var(--font-space-grotesk), var(--font-geist-sans), sans-serif;
  --tracking-label: 0.09em;
  --tracking-tight: -0.02em;

  /* --- Spacing / Layout --- */
  --card-pad: 24px;
  --page-pad-x: 42px;
  --page-pad-y: 38px;
  --sidebar-w: 240px;
  --row-pad-y: 14px;

  /* ========================================================================
     Bridge: shadcn-Semantik auf DS-Tokens.
     Dadurch werden bestehende Komponenten DS-konform, ohne sie anzufassen.
     ======================================================================== */
  --background: var(--bg);
  --foreground: var(--ink-900);
  --card: var(--surface);
  --card-foreground: var(--ink-900);
  --popover: var(--surface);
  --popover-foreground: var(--ink-900);
  --primary: var(--accent);
  --primary-foreground: var(--accent-fg);
  --secondary: var(--surface-sunken);
  --secondary-foreground: var(--ink-900);
  --muted: var(--surface-sunken);
  --muted-foreground: var(--ink-500);
  --accent-foreground: var(--accent-fg);
  --destructive: var(--expense);
  --border: var(--hairline);
  --input: var(--hairline-strong);
  --ring: var(--accent-ring);
  --sidebar: var(--bg);
  --sidebar-foreground: var(--ink-900);
  --sidebar-primary: var(--accent);
  --sidebar-primary-foreground: var(--accent-fg);
  --sidebar-accent: var(--surface-hover);
  --sidebar-accent-foreground: var(--ink-900);
  --sidebar-border: var(--hairline);
  --sidebar-ring: var(--accent-ring);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* DS-Flächen und Ink als Utilities */
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-surface-sunken: var(--surface-sunken);
  --color-surface-hover: var(--surface-hover);
  --color-hairline: var(--hairline);
  --color-hairline-strong: var(--hairline-strong);
  --color-ink-900: var(--ink-900);
  --color-ink-700: var(--ink-700);
  --color-ink-500: var(--ink-500);
  --color-ink-400: var(--ink-400);
  --color-ink-300: var(--ink-300);
  --color-accent-soft: var(--accent-soft);

  /* Semantik */
  --color-income: var(--income);
  --color-income-mid: var(--income-mid);
  --color-income-soft: var(--income-soft-bg);
  --color-expense: var(--expense);
  --color-expense-strong: var(--expense-strong);
  --color-expense-soft: var(--expense-soft-bg);
  --color-uncat: var(--uncat);
  --color-uncat-soft: var(--uncat-soft-bg);
  --color-review: var(--review);
  --color-review-soft: var(--review-soft-bg);

  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-chart-6: var(--chart-6);
  --color-chart-7: var(--chart-7);
  --color-chart-8: var(--chart-8);

  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-display);
  --font-heading: var(--font-display);

  --shadow-ds-xs: var(--shadow-xs);
  --shadow-ds-sm: var(--shadow-sm);
  --shadow-ds-md: var(--shadow-md);
  --shadow-ds-lg: var(--shadow-lg);
  --shadow-ds-accent: var(--shadow-accent);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
  /* Geldbeträge und KPI-Zahlen immer tabellarisch. */
  .tabular {
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
  }
}
```

Entfernt wurden dabei: `@custom-variant dark`, der gesamte `.dark`-Block, die oklch-Neutralpalette und die `calc()`-Radienleiter.

- [ ] **Step 2: Space Grotesk in `layout.tsx` einbinden**

Import-Zeile ersetzen:

```tsx
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
```

Nach `geistMono` ergänzen:

```tsx
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
```

`<html className>` erweitern:

```tsx
className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
```

- [ ] **Step 3: `themeColor` auf DS-Hintergrund setzen**

In `layout.tsx` den `viewport`-Export ersetzen (Dark-Eintrag entfällt, die App ist light-only):

```tsx
export const viewport: Viewport = {
  themeColor: "#FBF8F1",
};
```

- [ ] **Step 4: Build prüfen**

Run: `npm run build`
Expected: Erfolgreich. Tailwind darf keine unbekannten Utilities melden.

- [ ] **Step 5: Visuell prüfen**

Run: `npm run dev`, dann `/dashboard` öffnen.
Expected: Hintergrund ist warmes Creme statt Weiß. Karten weiß. Buttons und aktive Nav marine statt schwarz. Layout noch unverändert. Zahlen noch in Geist (Space Grotesk kommt ab Task 9).

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(ui): DS-Tokens und Space Grotesk einbinden, Dark Mode entfernen"
```

---

## Task 2: Geldformat auf Unicode-Minus

**Files:**
- Modify: `src/lib/money.ts`
- Test: `src/lib/money.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `formatCents(cents: bigint, currency?: string): string` — liefert bei negativen Beträgen U+2212 statt ASCII-Hyphen. Signatur unverändert.

- [ ] **Step 1: Failing Test schreiben**

In `src/lib/money.test.ts` ergänzen:

```ts
describe("formatCents — DS-Minuszeichen", () => {
  it("nutzt Unicode-Minus U+2212 statt ASCII-Hyphen", () => {
    const out = formatCents(-999n);
    expect(out).toContain("−");
    expect(out).not.toContain("-");
    expect(out).toBe("−9,99 €");
  });

  it("lässt positive Beträge unverändert", () => {
    expect(formatCents(104372n)).toBe("1.043,72 €");
  });

  it("bleibt round-trip-fähig mit parseGermanAmount", () => {
    for (const cents of [-999n, -890000n, 0n, 104372n]) {
      expect(parseGermanAmount(formatCents(cents))).toBe(cents);
    }
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/money.test.ts`
Expected: FAIL — erwartet `−9,99 €`, bekommt `-9,99 €`.

Falls die Assertion auf das geschützte Leerzeichen (` `) fehlschlägt: `Intl` mit `de-DE` liefert vor dem € ein NBSP. Den tatsächlichen Wert aus der Fehlermeldung übernehmen, nicht das Verhalten ändern.

- [ ] **Step 3: Implementieren**

In `src/lib/money.ts` `formatCents` ersetzen:

```ts
/**
 * Formatiert Cents als deutschen Währungsstring, z.B. -123456n -> "−1.234,56 €".
 * Negative Beträge nutzen U+2212 (Minuszeichen), wie vom Design System gefordert —
 * nicht den ASCII-Hyphen, den Intl per Default liefert.
 */
export function formatCents(cents: bigint, currency = "EUR"): string {
  const value = Number(cents) / 100;
  return formatterFor(currency).format(value).replace(/^-/, "−");
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/lib/money.test.ts`
Expected: PASS, alle Tests der Datei.

- [ ] **Step 5: Volle Suite laufen lassen**

Run: `npm test`
Expected: PASS. Falls andere Tests auf `-` in formatierten Beträgen assertieren, diese auf `−` anpassen — das ist die beabsichtigte Änderung, kein Regressionsfehler.

- [ ] **Step 6: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts
git commit -m "feat(money): Unicode-Minus in formatCents laut Design System"
```

---

## Task 3: Pure DS-Helper

**Files:**
- Create: `src/lib/ds/format.ts`
- Test: `src/lib/ds/format.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `initialFor(name: string | null | undefined): string`
  - `type AmountTone = "income" | "neutral"`
  - `toneForCents(cents: bigint): AmountTone`
  - `CHART_COLORS: readonly string[]` (8 Einträge, `var(--chart-N)`)
  - `chartColorAt(index: number): string`

- [ ] **Step 1: Failing Test schreiben**

`src/lib/ds/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CHART_COLORS, chartColorAt, initialFor, toneForCents } from "./format";

describe("initialFor", () => {
  it("liefert den ersten Buchstaben in Großschreibung", () => {
    expect(initialFor("REWE")).toBe("R");
    expect(initialFor("spotify")).toBe("S");
  });

  it("ignoriert führenden Leerraum", () => {
    expect(initialFor("  dm-drogerie")).toBe("D");
  });

  it("fällt bei leerem oder fehlendem Namen auf ? zurück", () => {
    expect(initialFor("")).toBe("?");
    expect(initialFor("   ")).toBe("?");
    expect(initialFor(null)).toBe("?");
    expect(initialFor(undefined)).toBe("?");
  });

  it("behandelt Umlaute korrekt", () => {
    expect(initialFor("Über Wasser GmbH")).toBe("Ü");
  });
});

describe("toneForCents", () => {
  it("markiert positive Beträge als Einnahme", () => {
    expect(toneForCents(1n)).toBe("income");
  });

  it("markiert Ausgaben und Null als neutral — Rot ist keine Betragsfarbe", () => {
    expect(toneForCents(-999n)).toBe("neutral");
    expect(toneForCents(0n)).toBe("neutral");
  });
});

describe("chartColorAt", () => {
  it("liefert die Palette in Reihenfolge", () => {
    expect(chartColorAt(0)).toBe("var(--chart-1)");
    expect(chartColorAt(7)).toBe("var(--chart-8)");
  });

  it("rotiert über das Palettenende hinaus", () => {
    expect(chartColorAt(8)).toBe("var(--chart-1)");
    expect(chartColorAt(9)).toBe("var(--chart-2)");
  });

  it("hat genau acht Farben", () => {
    expect(CHART_COLORS).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/ds/format.test.ts`
Expected: FAIL — `Cannot find module './format'`.

- [ ] **Step 3: Implementieren**

`src/lib/ds/format.ts`:

```ts
/**
 * Pure Helfer für die Design-System-Komponenten.
 * Bewusst frei von React, damit sie im node-Environment testbar bleiben.
 */

/** Initiale für den Merchant-Avatar. Das DS holt keine Logos — nur den ersten Buchstaben. */
export function initialFor(name: string | null | undefined): string {
  const first = (name ?? "").trim().charAt(0);
  return first === "" ? "?" : first.toUpperCase();
}

export type AmountTone = "income" | "neutral";

/**
 * Betragsfarbe laut DS: Einnahmen grün, Ausgaben neutral (--ink-900).
 * Rot ist im DS ausschließlich Label- und Tint-Farbe, nie die Farbe eines Betrags.
 */
export function toneForCents(cents: bigint): AmountTone {
  return cents > 0n ? "income" : "neutral";
}

/** Chart-Palette des DS: 8 harmonisierte Farben, kein Lila, kein Mint. */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

/** Farbe für den n-ten Datenpunkt; rotiert über das Palettenende hinaus. */
export function chartColorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/lib/ds/format.test.ts`
Expected: PASS, 10 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ds/format.ts src/lib/ds/format.test.ts
git commit -m "feat(ds): pure Helper für Initiale, Betrags-Tone und Chart-Palette"
```

---

## Task 4: Card auf DS-Anatomie

**Files:**
- Modify: `src/components/ui/card.tsx`

**Interfaces:**
- Consumes: Tokens aus Task 1
- Produces: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` — Exports und Props **unverändert**, nur Optik.

DS-Vorgabe (`components/surfaces/Card.jsx`): `background: var(--surface)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-md)`, **zusätzlich** `1px solid var(--hairline)`, `padding: var(--card-pad)` = 24px. Titel: `--text-title` (15px), semibold, `letter-spacing: -.01em`.

- [ ] **Step 1: Card-Container umstellen**

In `card.tsx` in der `Card`-Funktion die Klassen ändern:
- `rounded-xl` → `rounded-lg` (= 16px laut Task 1)
- `ring-1 ring-foreground/10` → `border border-hairline shadow-ds-md`
- `[--card-spacing:--spacing(4)]` → `[--card-spacing:24px]`
- `data-[size=sm]:[--card-spacing:--spacing(3)]` → `data-[size=sm]:[--card-spacing:16px]`
- Alle `rounded-t-xl` → `rounded-t-lg`, `rounded-b-xl` → `rounded-b-lg`

Ergebnis:

```tsx
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-lg border border-hairline bg-card py-(--card-spacing) text-sm text-card-foreground shadow-ds-md [--card-spacing:24px] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:16px] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg",
        className
      )}
```

- [ ] **Step 2: CardHeader-Radius angleichen**

`rounded-t-xl` → `rounded-t-lg` in `CardHeader`.

- [ ] **Step 3: CardTitle auf DS-Typografie**

```tsx
      className={cn(
        "text-[15px] leading-snug font-semibold tracking-[-0.01em] text-ink-900 group-data-[size=sm]/card:text-sm",
        className
      )}
```

`font-heading` entfällt hier bewusst — Kartentitel sind laut DS Inter/Geist, nicht Space Grotesk. Space Grotesk ist Displayzahlen und Seitentiteln vorbehalten.

- [ ] **Step 4: CardFooter entdunkeln**

`rounded-b-xl` → `rounded-b-lg`, `bg-muted/50` → `bg-surface-sunken/60`.

- [ ] **Step 5: Build und Sichtprüfung**

Run: `npm run build` → erfolgreich.
Run: `npm run dev`, `/dashboard` öffnen.
Expected: Karten haben sichtbar weichen, diffusen Schatten plus feine Haarlinie, Ecken deutlich runder (16px), Innenabstand großzügiger (24px).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "feat(ui): Card auf DS-Elevation, Radius und Padding"
```

---

## Task 5: Button auf DS-Varianten

**Files:**
- Modify: `src/components/ui/button.tsx`

**Interfaces:**
- Consumes: Tokens aus Task 1
- Produces: `Button`, `buttonVariants` — Varianten-Namen **unverändert** (`default`, `outline`, `secondary`, `ghost`, `destructive`, `link`), damit keine Aufrufstelle bricht.

DS-Mapping (`components/controls/Button.jsx`): DS-`primary` → `default`; DS-`secondary` → `outline`; DS-`ghost` → `ghost`; DS-`danger` → `destructive`.

- [ ] **Step 1: Basisklassen anpassen**

In der `cva`-Basis:
- `rounded-lg` → `rounded-md` (= 12px, DS nutzt `--radius-md` für Buttons)
- `active:not-aria-[haspopup]:translate-y-px` **entfernen** — das DS verbietet Shrink/Versatz beim Press ausdrücklich
- `dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40` entfernen
- `focus-visible:ring-3 focus-visible:ring-ring/50` → `focus-visible:ring-3 focus-visible:ring-ring`

- [ ] **Step 2: Varianten ersetzen**

```tsx
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-ds-accent hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)]",
        outline:
          "border-hairline-strong bg-surface text-ink-900 shadow-ds-xs hover:bg-surface-hover aria-expanded:bg-surface-hover",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-surface-hover aria-expanded:bg-surface-hover",
        ghost:
          "text-ink-700 hover:bg-surface-hover hover:text-ink-900 aria-expanded:bg-surface-hover",
        destructive:
          "border-hairline-strong bg-surface text-expense shadow-ds-xs hover:bg-surface-hover focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
```

- [ ] **Step 3: Größen auf DS-Maße**

Das DS nutzt Padding statt fixer Höhen (`sm: 8px 14px`, `md: 11px 18px`, `lg: 13px 22px`). Die base-nova-Höhen sind deutlich kompakter. Größen anheben:

- `default`: `h-8` → `h-10`, `px-2.5` → `px-[18px]`, `gap-1.5` → `gap-2`
- `sm`: `h-7` → `h-9`, `px-2.5` → `px-[14px]`
- `lg`: `h-9` → `h-11`, `px-2.5` → `px-[22px]`
- `icon`: `size-8` → `size-10`; `icon-sm`: `size-7` → `size-9`; `icon-lg`: `size-9` → `size-11`
- In `sm`/`xs`/`icon-xs`/`icon-sm` die `rounded-[min(var(--radius-md),12px)]`- bzw. `rounded-[min(var(--radius-md),10px)]`-Ausdrücke durch `rounded-md` ersetzen

- [ ] **Step 4: Build und Sichtprüfung**

Run: `npm run build` → erfolgreich.
Expected im Browser: Primärbutton marine mit weichem farbigem Schatten. Beim Drücken dunkler, **ohne** Versatz nach unten.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat(ui): Button auf DS-Varianten, Größen und Accent-Schatten"
```

---

## Task 6: Badge auf semantische Tones

**Files:**
- Modify: `src/components/ui/badge.tsx`

**Interfaces:**
- Consumes: Tokens aus Task 1
- Produces: `Badge`, `badgeVariants` — bestehende Varianten bleiben, **neu hinzu**: `income`, `expense`, `review`, `uncat`, `accent`. Verwendung: `<Badge variant="review">Prüfen</Badge>`.

DS-Vorgabe (`components/surfaces/Badge.jsx`): Pill-Radius, `padding: 4px 10px`, `--text-xs` (12px), semibold, Tone-Paare bg/fg.

- [ ] **Step 1: Basisklassen anpassen**

- `h-5` → `h-auto`, `py-0.5` → `py-1` (DS: 4px vertikal)
- `rounded-4xl` → `rounded-[var(--radius-pill)]`
- `font-medium` → `font-semibold`
- `dark:aria-invalid:ring-destructive/40` entfernen

- [ ] **Step 2: Varianten ergänzen und entdunkeln**

```tsx
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-surface-sunken text-ink-500 [a]:hover:bg-surface-hover",
        destructive:
          "bg-expense-soft text-expense-strong [a]:hover:bg-expense-soft/80",
        outline:
          "border-hairline text-ink-700 [a]:hover:bg-surface-hover",
        ghost: "text-ink-500 hover:bg-surface-hover",
        link: "text-primary underline-offset-4 hover:underline",
        accent: "bg-accent-soft text-[var(--accent)]",
        income: "bg-income-soft text-income",
        expense: "bg-expense-soft text-expense-strong",
        review: "bg-review-soft text-review",
        uncat: "bg-uncat-soft text-uncat",
      },
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: erfolgreich.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/badge.tsx
git commit -m "feat(ui): Badge mit semantischen DS-Tones"
```

---

## Task 7: Input und Tabs

**Files:**
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/tabs.tsx`

**Interfaces:**
- Consumes: Tokens aus Task 1
- Produces: `Input`; `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` — Exports unverändert. `TabsList` sieht nach dem DS-`SegmentedControl` aus.

DS-`SegmentedControl`: **weißer** Container (`--surface`, 1px `--hairline`, `--shadow-sm`, `--radius-md`, 4px Innenpadding), aktives Segment **marine gefüllt** mit `--shadow-accent` und `--radius-sm`. Nicht die versenkte graue Bahn von shadcn.

- [ ] **Step 1: Input umstellen**

In `input.tsx`:
- `h-8` → `h-10`, `px-2.5` → `px-3`
- `rounded-lg` → `rounded-md`
- `border-input bg-transparent` → `border-hairline-strong bg-surface`
- `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` → `focus-visible:border-[var(--accent)] focus-visible:ring-3 focus-visible:ring-ring`
- `placeholder:text-muted-foreground` → `placeholder:text-ink-400`
- Alle `dark:`-Fragmente entfernen: `dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40`
- `shadow-ds-xs` ergänzen

- [ ] **Step 2: TabsList auf DS-Container**

```tsx
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-md p-1 text-ink-500 group-data-horizontal/tabs:h-auto group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "border border-hairline bg-surface shadow-ds-sm",
        line: "gap-1 border-0 bg-transparent shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)
```

- [ ] **Step 3: TabsTrigger auf marine-gefüllt**

In `TabsTrigger` die drei Klassenblöcke ersetzen. Der aktive Zustand wird marine statt weiß:

```tsx
      className={cn(
        "relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-transparent px-4 py-2 text-[13.5px] font-medium whitespace-nowrap text-ink-500 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-ink-900 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:text-ink-900",
        "group-data-[variant=default]/tabs-list:data-active:bg-primary group-data-[variant=default]/tabs-list:data-active:text-primary-foreground group-data-[variant=default]/tabs-list:data-active:font-semibold group-data-[variant=default]/tabs-list:data-active:shadow-ds-accent",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
```

Die alte Zeile `"data-active:bg-background data-active:text-foreground dark:..."` entfällt ersatzlos.

- [ ] **Step 4: Build und Sichtprüfung**

Run: `npm run build` → erfolgreich.
Expected: Wo Tabs verwendet werden, ist das aktive Segment jetzt marine gefüllt auf weißer Bahn.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/input.tsx src/components/ui/tabs.tsx
git commit -m "feat(ui): Input und Tabs auf DS-Optik (SegmentedControl-Look)"
```

---

## Task 8: Restliche Primitives und `dark:`-Kehraus

**Files:**
- Modify: `src/components/ui/select.tsx`, `dropdown-menu.tsx`, `dialog.tsx`, `sheet.tsx`, `table.tsx`, `skeleton.tsx`

**Interfaces:**
- Consumes: Tokens aus Task 1
- Produces: keine API-Änderung, nur Optik. Nach dieser Task ist `src/components/ui/` frei von `dark:`.

- [ ] **Step 1: Verbleibende `dark:`-Stellen finden**

Run: `grep -rn "dark:" src/components/ui/`
Expected: Treffer in `select.tsx`, `dropdown-menu.tsx` und ggf. weiteren.

- [ ] **Step 2: Jede Fundstelle entfernen**

Regel: Das `dark:`-Fragment ersatzlos streichen. Der Light-Wert daneben bleibt stehen — er ist über die Bridge bereits DS-konform. Beispiel: `bg-input/30 dark:bg-input/50` → `bg-input/30`.

- [ ] **Step 3: Popover-Flächen auf DS-Elevation**

In `select.tsx`, `dropdown-menu.tsx`, `dialog.tsx`, `sheet.tsx` bei den Popup-/Content-Containern:
- `rounded-lg`/`rounded-md` → `rounded-md`
- vorhandene `shadow-md`/`shadow-lg` → `shadow-ds-lg`
- `border` ergänzen bzw. auf `border-hairline` setzen

- [ ] **Step 4: Table auf DS-Zeilenmaße**

In `table.tsx` bei der Zellen-/Zeilendefinition:
- Vertikales Padding auf `py-[14px]` (= `--row-pad-y`)
- Zeilentrenner auf `border-hairline`
- Hover-Zeile auf `hover:bg-surface-hover`

- [ ] **Step 5: Skeleton auf DS-Fläche**

`bg-muted`/`bg-accent` → `bg-surface-sunken`, `rounded-md` beibehalten.

- [ ] **Step 6: Prüfen**

Run: `grep -rn "dark:" src/components/ui/`
Expected: **keine Ausgabe.**

Run: `npm run build`
Expected: erfolgreich.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/
git commit -m "feat(ui): restliche Primitives auf DS-Tokens, dark: entfernt"
```

---

## Task 9: Money, MerchantAvatar, KpiCard

**Files:**
- Create: `src/components/ds/money.tsx`
- Create: `src/components/ds/merchant-avatar.tsx`
- Create: `src/components/ds/kpi-card.tsx`
- Delete: `src/components/stat-tile.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (nur Import/Aufruf, damit der Build grün bleibt)

**Interfaces:**
- Consumes: `initialFor`, `toneForCents` aus `@/lib/ds/format` (Task 3); `formatCents` aus `@/lib/money` (Task 2)
- Produces:
  - `<Money cents={bigint} currency?={string} className?={string} />`
  - `<Money.Text value={string} tone?={"income" | "neutral"} className?={string} />` — für bereits formatierte Strings aus den DTOs
  - `<MerchantAvatar name={string} className?={string} />`
  - `<KpiCard label={string} value={string} tone?={"neutral" | "income" | "expense" | "accent"} delta?={string} deltaDir?={"up" | "down"} icon?={LucideIcon} />`

DS-Vorgaben: `KpiCard.jsx` — Eyebrow `--text-2xs` (11px) semibold uppercase mit `--tracking-label`, Wert `--text-kpi` (30px) bold in `--font-display` mit `--tracking-tight`, Padding `20px 22px`, Radius `--radius-lg`. Tones: `neutral` weiß + `--shadow-md` + Hairline; `income` `--income-soft-bg` randlos; `expense` `--expense-soft-bg` randlos; `accent` `--accent` gefüllt + `--shadow-accent`.

- [ ] **Step 1: `money.tsx` schreiben**

```tsx
import { formatCents } from "@/lib/money";
import { toneForCents, type AmountTone } from "@/lib/ds/format";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<AmountTone, string> = {
  income: "text-income",
  neutral: "text-ink-900",
};

/**
 * Geldbetrag in DS-Optik: Space Grotesk, tabellarisch, rechtsbündig.
 * Einnahmen grün, Ausgaben neutral — Rot ist im DS keine Betragsfarbe.
 */
export function Money({
  cents,
  currency,
  className,
}: {
  cents: bigint;
  currency?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular font-display text-[15px] font-semibold tracking-[-0.01em]",
        TONE_CLASS[toneForCents(cents)],
        className,
      )}
    >
      {formatCents(cents, currency)}
    </span>
  );
}

/** Variante für bereits formatierte Strings, wie sie die Analytics-DTOs liefern. */
function MoneyText({
  value,
  tone = "neutral",
  className,
}: {
  value: string;
  tone?: AmountTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular font-display text-[15px] font-semibold tracking-[-0.01em]",
        TONE_CLASS[tone],
        className,
      )}
    >
      {value}
    </span>
  );
}

Money.Text = MoneyText;
```

- [ ] **Step 2: `merchant-avatar.tsx` schreiben**

```tsx
import { initialFor } from "@/lib/ds/format";
import { cn } from "@/lib/utils";

/**
 * Getöntes Quadrat mit der Initiale des Händlers.
 * Das DS holt bewusst keine Logos — nur der erste Buchstabe.
 */
export function MerchantAvatar({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[38px] shrink-0 place-items-center rounded-sm bg-accent-soft text-sm font-semibold text-[var(--accent)]",
        className,
      )}
    >
      {initialFor(name)}
    </span>
  );
}
```

- [ ] **Step 3: `kpi-card.tsx` schreiben**

```tsx
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type KpiTone = "neutral" | "income" | "expense" | "accent";

const TONES: Record<KpiTone, { card: string; label: string; value: string; delta: string }> = {
  neutral: {
    card: "bg-surface border border-hairline shadow-ds-md",
    label: "text-ink-400",
    value: "text-ink-900",
    delta: "text-ink-500",
  },
  income: {
    card: "bg-income-soft border border-transparent",
    label: "text-income-mid",
    value: "text-income",
    delta: "text-income-mid",
  },
  expense: {
    card: "bg-expense-soft border border-transparent",
    label: "text-expense",
    value: "text-expense-strong",
    delta: "text-expense",
  },
  accent: {
    card: "bg-primary border border-transparent shadow-ds-accent",
    label: "text-white/75",
    value: "text-white",
    delta: "text-white/85",
  },
};

/**
 * KPI-Kachel — die Signaturkomponente des Design Systems.
 * Uppercase-Eyebrow, große Space-Grotesk-Zahl, optionale Delta-Zeile.
 */
export function KpiCard({
  label,
  value,
  tone = "neutral",
  delta,
  deltaDir,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: KpiTone;
  delta?: string;
  deltaDir?: "up" | "down";
  icon?: LucideIcon;
}) {
  const t = TONES[tone];
  const DeltaIcon = deltaDir === "up" ? TrendingUp : deltaDir === "down" ? TrendingDown : null;

  return (
    <div className={cn("rounded-lg px-[22px] py-5", t.card)}>
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[11px] font-semibold tracking-[var(--tracking-label)] uppercase",
            t.label,
          )}
        >
          {label}
        </span>
        {Icon && <Icon className={cn("size-[17px]", t.label)} strokeWidth={1.75} />}
      </div>
      <div
        className={cn(
          "tabular font-display mt-3 text-[30px] leading-none font-bold tracking-[var(--tracking-tight)]",
          t.value,
        )}
      >
        {value}
      </div>
      {delta && (
        <div className={cn("tabular mt-2 flex items-center gap-1.5 text-[13px] font-medium", t.delta)}>
          {DeltaIcon && <DeltaIcon className="size-[15px]" strokeWidth={2} />}
          {delta}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `stat-tile.tsx` ablösen**

Run: `grep -rn "StatTile\|stat-tile" src/`
Expected: Treffer nur in `src/app/(app)/dashboard/page.tsx` und der Datei selbst.

In `dashboard/page.tsx` den Import tauschen:

```tsx
import { KpiCard } from "@/components/ds/kpi-card";
```

und die vier Aufrufe ersetzen:

```tsx
        <KpiCard label="Gesamtsaldo" value={dto.totalBalanceFmt} tone="accent" icon={Wallet} />
        <KpiCard label="Einnahmen / Monat" value={dto.incomeFmt} tone="income" />
        <KpiCard label="Ausgaben / Monat" value={dto.expensesFmt} tone="expense" />
        <KpiCard label="Abos / Monat" value={dto.subsFmt} tone="neutral" icon={Repeat} />
```

Import ergänzen: `import { Repeat, Wallet } from "lucide-react";`

Dann `src/components/stat-tile.tsx` löschen.

- [ ] **Step 5: Build und Sichtprüfung**

Run: `npm run build`
Expected: erfolgreich, keine Referenz auf `stat-tile` mehr.

Run: `npm run dev`, `/dashboard` öffnen.
Expected: Gesamtsaldo als gefüllte Marine-Kachel, Einnahmen grün getönt, Ausgaben rot getönt, Abos weiß. Zahlen groß in Space Grotesk.

- [ ] **Step 6: Commit**

```bash
git add src/components/ds/ src/app/\(app\)/dashboard/page.tsx
git rm src/components/stat-tile.tsx
git commit -m "feat(ds): Money, MerchantAvatar und KpiCard, StatTile abgelöst"
```

---

## Task 10: TransactionRow

**Files:**
- Create: `src/components/ds/transaction-row.tsx`

**Interfaces:**
- Consumes: `MerchantAvatar` (Task 9), `Money` (Task 9), `Badge` (Task 6)
- Produces: `<TransactionRow name meta amount tone? category? categoryTone? recurring? review? uncategorized? onClick? />`
  - `amount: string` (bereits formatiert), `tone?: "income" | "neutral"`
  - `categoryTone?: "secondary" | "income" | "accent"` — muss eine **Badge-Variante** aus Task 6 sein, nicht der `AmountTone`. Default `"secondary"`.

DS-Vorgabe (`components/data/TransactionRow.jsx`): Höhe 64px, `gap: 14`, `padding: 0 12px`, `--radius-md`, Hover `--surface-hover`. Avatar 38px. Betrag `min-width: 104px`, rechtsbündig, 15px semibold in `--font-display`.

- [ ] **Step 1: Komponente schreiben**

```tsx
"use client";

import { Repeat, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MerchantAvatar } from "@/components/ds/merchant-avatar";
import { Money } from "@/components/ds/money";
import { cn } from "@/lib/utils";
import type { AmountTone } from "@/lib/ds/format";

/**
 * Eine Transaktionszeile: Avatar, Name mit Wiederkehr-Glyph, Meta,
 * Kategorie-Badge und rechtsbündiger Betrag.
 */
export function TransactionRow({
  name,
  meta,
  amount,
  tone = "neutral",
  category,
  categoryTone = "secondary",
  recurring,
  review,
  uncategorized,
  onClick,
}: {
  name: string;
  meta?: string;
  amount: string;
  tone?: AmountTone;
  category?: string | null;
  /** Muss eine Badge-Variante sein — nicht mit AmountTone verwechseln. */
  categoryTone?: "secondary" | "income" | "accent";
  recurring?: boolean;
  review?: boolean;
  uncategorized?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex h-16 items-center gap-3.5 rounded-md px-3 transition-colors",
        onClick && "cursor-pointer hover:bg-surface-hover",
      )}
    >
      <MerchantAvatar name={name} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink-900">{name}</span>
          {recurring && (
            <Repeat className="size-3.5 shrink-0 text-ink-400" strokeWidth={2} aria-label="Wiederkehrend" />
          )}
        </div>
        {meta && <div className="mt-0.5 text-xs text-ink-400">{meta}</div>}
      </div>

      <div className="flex items-center gap-2.5">
        {uncategorized ? (
          <Badge variant="uncat">Nicht kategorisiert</Badge>
        ) : (
          category && <Badge variant={categoryTone}>{category}</Badge>
        )}
        {review && (
          <Badge variant="review">
            <TriangleAlert className="size-3" strokeWidth={2} />
            Prüfen
          </Badge>
        )}
        <Money.Text value={amount} tone={tone} className="min-w-[104px] text-right" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: erfolgreich.

- [ ] **Step 3: Commit**

```bash
git add src/components/ds/transaction-row.tsx
git commit -m "feat(ds): TransactionRow"
```

---

## Task 11: FilterPill, FilterChip, SegmentedControl, EmptyState

**Files:**
- Create: `src/components/ds/filter-pill.tsx`
- Create: `src/components/ds/segmented-control.tsx`
- Create: `src/components/ds/empty-state.tsx`

**Interfaces:**
- Produces:
  - `<FilterPill active? count? dropdown? icon? onClick?>{children}</FilterPill>`
  - `<FilterChip label? value onRemove />`
  - `<SegmentedControl options={{value,label}[]} value onChange size?={"sm"|"md"} />`
  - `<EmptyState icon?={LucideIcon} title? message? action? compact? />`

- [ ] **Step 1: `filter-pill.tsx` schreiben**

```tsx
"use client";

import { ChevronDown, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Filter-Pille. Aktiv = getönter Akzentgrund ohne Rand. */
export function FilterPill({
  children,
  active,
  count,
  dropdown,
  icon: Icon,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  count?: number;
  dropdown?: boolean;
  icon?: LucideIcon;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-[7px] rounded-[var(--radius-pill)] px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
        active
          ? "border border-transparent bg-accent-soft text-[var(--accent)]"
          : "border border-hairline-strong bg-surface text-ink-700 shadow-ds-xs hover:bg-surface-hover",
      )}
    >
      {Icon && <Icon className="size-[15px]" strokeWidth={2} />}
      {children}
      {count != null && (
        <span
          className={cn(
            "tabular inline-grid h-[18px] min-w-[18px] place-items-center rounded-[var(--radius-pill)] px-1.5 text-[11px] font-semibold",
            active ? "bg-primary text-primary-foreground" : "bg-surface-sunken text-ink-500",
          )}
        >
          {count}
        </span>
      )}
      {dropdown && <ChevronDown className="-mr-0.5 size-[15px] opacity-70" strokeWidth={2} />}
    </button>
  );
}

/** Aktiver Filter als entfernbarer Chip. */
export function FilterChip({
  label,
  value,
  onRemove,
}: {
  label?: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-accent-soft py-1.5 pr-1.5 pl-3 text-[12.5px] font-medium text-[var(--accent)] whitespace-nowrap">
      {label && <span className="opacity-70">{label}:</span>}
      <span className="font-semibold">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Filter ${label ? `${label}: ` : ""}${value} entfernen`}
        className="grid size-[18px] place-items-center rounded-[var(--radius-pill)] transition-colors hover:bg-[rgba(34,58,122,.14)]"
      >
        <X className="size-[13px]" strokeWidth={2.5} />
      </button>
    </span>
  );
}
```

- [ ] **Step 2: `segmented-control.tsx` schreiben**

```tsx
"use client";

import { cn } from "@/lib/utils";

/** Segment-Umschalter. Aktives Segment marine gefüllt auf weißer Bahn. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-md border border-hairline bg-surface p-1 shadow-ds-sm">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "rounded-sm whitespace-nowrap transition-colors",
              size === "sm" ? "px-3 py-1.5 text-[12.5px]" : "px-4 py-2 text-[13.5px]",
              active
                ? "bg-primary font-semibold text-primary-foreground shadow-ds-accent"
                : "font-medium text-ink-500 hover:text-ink-900",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: `empty-state.tsx` schreiben**

```tsx
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Leerzustand: Icon auf weicher Fläche, Titel, Erklärung, optionale Aktion. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title?: string;
  message?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 text-center",
        compact ? "px-6 py-7" : "px-8 py-12",
      )}
    >
      <div
        className={cn(
          "mb-3 grid place-items-center rounded-lg bg-surface-sunken text-ink-400",
          compact ? "size-11" : "size-14",
        )}
      >
        <Icon className={compact ? "size-[22px]" : "size-[26px]"} strokeWidth={1.75} />
      </div>
      {title && <div className="text-[15px] leading-snug font-semibold text-ink-900">{title}</div>}
      {message && <div className="max-w-[320px] text-[13px] leading-normal text-ink-500">{message}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: erfolgreich.

- [ ] **Step 5: Commit**

```bash
git add src/components/ds/
git commit -m "feat(ds): FilterPill, FilterChip, SegmentedControl, EmptyState"
```

---

## Task 12: Navigation

**Files:**
- Modify: `src/components/app-nav.tsx`

**Interfaces:**
- Consumes: Tokens aus Task 1
- Produces: `Sidebar`, `BottomTabs` — Exports unverändert.

DS-Vorgabe (`components/navigation/Sidebar.jsx`): Breite `--sidebar-w`, Grund `--bg` (**nicht** `--surface`), Padding `26px 16px 20px`, Markenzeile mit Wallet-Icon in marine Kachel plus Wortmarke in `--font-display` bold 19px. Nav-Item: `11px 12px`, `--radius-md`, aktiv = `--accent` gefüllt + `--accent-fg` + `--shadow-accent`, inaktiv `--ink-500`, Hover `--surface-hover`. Icon 19px, aktiv Strokewidth 2.

Die App behält ihre **fünf** Tabs inklusive Einstellungen — das UI-Kit zeigt mobil nur vier, aber die IA-Vorgabe des Readmes nennt fünf.

- [ ] **Step 1: Sidebar ersetzen**

```tsx
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-[var(--sidebar-w)] shrink-0 flex-col bg-background px-4 pt-[26px] pb-5 md:flex">
      <div className="flex items-center gap-2.5 px-3 pb-[26px]">
        <span className="grid size-[30px] place-items-center rounded-[9px] bg-primary text-primary-foreground">
          <Wallet className="size-[17px]" strokeWidth={2} />
        </span>
        <span className="font-display text-[19px] font-bold tracking-[-0.015em] text-ink-900">
          Financiero
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-[11px] text-[14.5px] transition-colors",
                active
                  ? "bg-primary font-semibold text-primary-foreground shadow-ds-accent"
                  : "font-medium text-ink-500 hover:bg-surface-hover hover:text-ink-900",
              )}
            >
              <Icon className="size-[19px]" strokeWidth={active ? 2 : 1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

Import ergänzen: `Wallet` aus `lucide-react`.

- [ ] **Step 2: BottomTabs ersetzen**

```tsx
export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline bg-surface pt-2 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-1 text-[10.5px]",
              active ? "font-semibold text-[var(--accent)]" : "font-medium text-ink-400",
            )}
          >
            <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Sichtprüfung**

Run: `npm run dev`
Expected: Aktiver Nav-Eintrag ist eine gefüllte Marine-Pille mit weichem farbigem Schatten. Sidebar hat keinen eigenen Kartengrund mehr, sondern steht auf dem Creme-Hintergrund. Wortmarke mit Wallet-Kachel.

Im Mobile-Breakpoint (Devtools, 390px Breite): Bottom-Tabs auf weißem Grund, aktives Symbol marine.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-nav.tsx
git commit -m "feat(ui): Navigation mit Marine-Pille und Wortmarke"
```

---

## Task 13: App-Shell und PageHeader

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/page-header.tsx`

**Interfaces:**
- Produces: `<PageHeader title lead? right? />` — **`description` wird zu `lead`, neu ist `right`.** Alle Aufrufstellen müssen mitziehen (Schritt 3).

DS-Vorgabe (`ui_kits/financiero/Shell.jsx`): H1 in `--font-display` bold `--text-h1` (28px) mit `--tracking-tight`; Lead 14.5px `--ink-500`, 7px Abstand; Kopfzeile `margin-bottom: 26px`, rechter Slot unten ausgerichtet.

- [ ] **Step 1: PageHeader ersetzen**

```tsx
export function PageHeader({
  title,
  lead,
  right,
}: {
  title: string;
  lead?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-[26px] flex items-end justify-between gap-5">
      <div>
        <h1 className="font-display text-[28px] leading-tight font-bold tracking-[var(--tracking-tight)] text-ink-900">
          {title}
        </h1>
        {lead && <p className="mt-[7px] text-[14.5px] leading-normal text-ink-500">{lead}</p>}
      </div>
      {right}
    </div>
  );
}
```

- [ ] **Step 2: App-Shell auf DS-Maße**

```tsx
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar />
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <main className="mx-auto max-w-6xl px-4 py-8 md:px-[var(--page-pad-x)] md:py-[var(--page-pad-y)]">
          {children}
        </main>
      </div>
      <BottomTabs />
      <Toaster position="top-center" richColors />
    </div>
  );
}
```

- [ ] **Step 3: Alle PageHeader-Aufrufe umstellen**

Run: `grep -rn "PageHeader" src/app/`
Expected: Treffer in den 5 Screens plus Settings-Unterseiten.

In jedem Treffer `description=` zu `lead=` umbenennen. Wo bisher `<div className="... flex ... justify-between">` einen Aktionsbutton neben den Header setzte, den Button stattdessen als `right={...}` übergeben und den Wrapper-`div` entfernen. Beispiel `dashboard/page.tsx`:

```tsx
      <PageHeader
        title="Dashboard"
        lead="Überblick über deine Finanzen."
        right={<SyncButton />}
      />
```

- [ ] **Step 4: Build und Sichtprüfung**

Run: `npm run build`
Expected: erfolgreich, keine TypeScript-Fehler wegen `description`.

Run: `npm run dev`, alle 5 Screens durchklicken.
Expected: Seitentitel groß in Space Grotesk, Aktionsbutton rechts auf Grundlinie.

- [ ] **Step 5: Commit**

```bash
git add src/components/page-header.tsx src/app/
git commit -m "feat(ui): App-Shell und PageHeader auf DS-Maße"
```

---

## Task 14: Charts umfärben

**Files:**
- Modify: `src/components/charts/category-donut.tsx`
- Modify: `src/components/charts/trend-bars.tsx`
- Modify: `src/components/contracts/sparkline.tsx`

**Interfaces:**
- Consumes: `chartColorAt`, `CHART_COLORS` aus `@/lib/ds/format` (Task 3); `EmptyState` (Task 11)
- Produces: keine API-Änderung.

- [ ] **Step 1: Bestehende Chart-Farben lesen**

Run: `cat src/components/charts/category-donut.tsx src/components/charts/trend-bars.tsx src/components/contracts/sparkline.tsx`

Notieren, wo Farben gesetzt werden (`fill`, `stroke`, `Cell`-Elemente, `dark:`-Klassen).

- [ ] **Step 2: Donut auf DS-Palette**

Alle hartkodierten Farben und `var(--chart-N)`-Referenzen mit N > 5 durch `chartColorAt(index)` ersetzen. Der Donut bekommt zusätzlich:
- Ring-Hintergrund `var(--surface-sunken)`
- Mittelbeschriftung: Eyebrow `GESAMT` (11px, semibold, uppercase, `--tracking-label`, `--ink-400`) über der Gesamtsumme in `--font-display` bold, tabellarisch
- Bei leerem Datensatz `<EmptyState compact title="Noch keine Ausgaben" message="Sobald Umsätze da sind, siehst du hier die Verteilung." />`

- [ ] **Step 3: Bars auf Einnahmen/Ausgaben-Semantik**

Einnahmen-Serie `var(--income-mid)`, Ausgaben-Serie `var(--expense)`. Achsenbeschriftung `--ink-400`, 11.5px. Balken oben abgerundet (`radius={[6, 6, 0, 0]}`). Legende mit 9px-Farbpunkten über einer `--hairline`-Trennlinie.

- [ ] **Step 4: Sparkline**

Linienfarbe auf `var(--chart-2)`, `dark:`-Klassen entfernen.

- [ ] **Step 5: Prüfen**

Run: `grep -rn "dark:" src/components/charts/ src/components/contracts/sparkline.tsx`
Expected: keine Ausgabe.

Run: `npm run build` → erfolgreich.
Sichtprüfung `/dashboard` und `/analysis`: Donut in Marine-Blau-Sand-Tönen, kein Grau, kein Lila. Balken grün/rot.

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/ src/components/contracts/sparkline.tsx
git commit -m "feat(charts): DS-Palette und Semantik für Donut, Bars und Sparkline"
```

---

## Task 15: Dashboard-Screen

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `KpiCard`, `TransactionRow`, `Money`, `EmptyState`, `PageHeader`, `Badge`

Ziel-Layout laut `ui_kits/financiero/Dashboard.jsx`: KPI-Reihe (4 Spalten, `gap: 18px`), darunter zwei Zeilen à `1.3fr 1fr` — erst Donut + Konten, dann Letzte Umsätze + Anstehende Abbuchungen. **Die IA bleibt exakt; neu ist nur die Karte "Letzte Umsätze".**

- [ ] **Step 1: Warnbanner auf DS-Tokens**

Die beiden Banner (Consent-Warnung, Review-Queue) umstellen:

```tsx
      {warnings.map((w) => (
        <Link key={w.aspspName} href="/settings/connections">
          <p className="mb-3 rounded-md bg-expense-soft px-4 py-3 text-sm text-expense-strong">
            {w.aspspName}: Bankverbindung {w.status === "expired" ? "ist abgelaufen" : `läuft in ${w.daysLeft} Tagen ab`} — jetzt neu verbinden.
          </p>
        </Link>
      ))}

      {review.count > 0 && (
        <Link href="/settings/review">
          <p className="mb-3 rounded-md bg-review-soft px-4 py-3 text-sm text-review">
            {review.count} KI-Zuordnung{review.count === 1 ? "" : "en"} mit niedriger Sicherheit prüfen.
          </p>
        </Link>
      )}
```

- [ ] **Step 2: KPI-Reihe auf DS-Abstände**

```tsx
      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
```

Die vier `KpiCard`-Aufrufe aus Task 9 bleiben.

- [ ] **Step 3: Erste Kartenzeile — Donut und Konten**

```tsx
      <div className="mb-[18px] grid gap-[18px] lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ausgaben nach Kategorie</CardTitle>
            <CardDescription>{dto.currentMonthLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryDonut data={dto.donut} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Konten</CardTitle>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <EmptyState
                compact
                icon={Landmark}
                title="Noch kein Konto"
                message="Verbinde dein Konto oder importiere eine CSV-Datei."
                action={
                  <Button render={<Link href="/settings/connections" />} size="sm">
                    Konto verbinden
                  </Button>
                }
              />
            ) : (
              accounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 border-b border-hairline py-3 last:border-0"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-[var(--accent)]">
                    <Landmark className="size-[18px]" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-900">{a.name}</div>
                  </div>
                  {a.balanceCents != null ? (
                    <Money cents={a.balanceCents} currency={a.currency} />
                  ) : (
                    <span className="text-sm text-ink-400">–</span>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
```

Falls `dto.currentMonthLabel` im Analytics-DTO nicht existiert, die `CardDescription`-Zeile weglassen — **das DTO nicht erweitern**, das wäre außerhalb des Scopes.

- [ ] **Step 4: Zweite Kartenzeile — Anstehende Abbuchungen**

```tsx
        <Card>
          <CardHeader>
            <CardTitle>Anstehende Abbuchungen</CardTitle>
            <CardDescription>Nächste 14 Tage</CardDescription>
          </CardHeader>
          <CardContent>
            {dto.upcoming.length === 0 ? (
              <EmptyState
                compact
                icon={Calendar}
                title="Nichts in Sicht"
                message="In den nächsten 14 Tagen steht keine Abbuchung an."
              />
            ) : (
              dto.upcoming.map((u, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-hairline py-3 last:border-0"
                >
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-surface-sunken text-ink-500">
                    <Calendar className="size-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink-900">{u.name}</div>
                    <div className="text-[11.5px] text-ink-400">{u.dateFmt}</div>
                  </div>
                  <Money.Text value={u.fmt} className="text-sm" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
```

Das Datum wandert aus dem `Badge` in die Metazeile — das UI-Kit zeigt es dort, und ein Badge neben jedem Eintrag konkurriert visuell mit den Kategorie-Badges der Umsatzliste.

- [ ] **Step 5: Imports ergänzen**

```tsx
import { Calendar, Landmark, Repeat, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ds/empty-state";
import { Money } from "@/components/ds/money";
```

Nicht mehr genutzte Imports (`Badge`, `formatCents`) entfernen.

- [ ] **Step 6: Prüfen**

Run: `npm run build` → erfolgreich.
Run: `npm run lint` → keine Warnung über ungenutzte Imports.
Sichtprüfung `/dashboard`: KPI-Reihe mit marine Gesamtsaldo, Donut in DS-Farben, Konten mit Landmark-Kacheln, Beträge in Space Grotesk rechtsbündig.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(dashboard): Layout und Komponenten nach UI-Kit"
```

---

## Task 16: Transaktionen-Screen

**Files:**
- Modify: `src/components/transactions/tx-view.tsx`
- Modify: `src/app/(app)/transactions/page.tsx`

**Interfaces:**
- Consumes: `TransactionRow`, `FilterPill`, `FilterChip`, `EmptyState`, `Input`

IA laut Readme: Suche, Filter, aktive Filter-Chips, Datumsgruppen, Summenzeile.

- [ ] **Step 1: Bestehende View lesen**

Run: `cat src/components/transactions/tx-view.tsx`

Notieren: Filter-State, wie Transaktionen gruppiert werden, wo Beträge gerendert werden.

- [ ] **Step 2: Suchfeld auf DS-Optik**

Suchfeld mit führender Lupe:

```tsx
        <div className="relative w-full sm:w-[320px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-ink-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Umsätze durchsuchen …"
            className="pl-10"
          />
        </div>
```

- [ ] **Step 3: Filter als FilterPill, aktive Filter als FilterChip**

Bestehende Filter-Buttons durch `<FilterPill active={…} count={…} dropdown icon={SlidersHorizontal}>` ersetzen. Direkt darunter eine Chip-Reihe für gesetzte Filter:

```tsx
        {activeFilters.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {activeFilters.map((f) => (
              <FilterChip key={f.key} label={f.label} value={f.value} onRemove={() => f.clear()} />
            ))}
          </div>
        )}
```

`activeFilters` aus dem vorhandenen Filter-State ableiten — **keinen neuen State einführen.**

- [ ] **Step 4: Zeilen auf TransactionRow**

Jede Transaktionszeile ersetzen:

```tsx
              <TransactionRow
                key={t.id}
                name={t.merchant ?? t.description}
                meta={`${t.accountName} · ${t.dateFmt}`}
                amount={t.amountFmt}
                tone={t.amountCents > 0n ? "income" : "neutral"}
                category={t.categoryLabel}
                categoryTone={t.amountCents > 0n ? "income" : "secondary"}
                uncategorized={!t.categoryLabel}
                review={t.needsReview}
                recurring={t.isRecurring}
              />
```

Feldnamen an das tatsächliche DTO anpassen — die Namen oben sind Platzhalter für die real vorhandenen Felder, die in Schritt 1 notiert wurden.

- [ ] **Step 5: Datumsgruppen und Summenzeile**

Gruppenüberschrift:

```tsx
            <div className="mt-6 mb-1 px-3 text-[11px] font-semibold tracking-[var(--tracking-label)] text-ink-400 uppercase first:mt-0">
              {groupLabel}
            </div>
```

Summenzeile am Ende der Gruppe:

```tsx
            <div className="flex items-center justify-between border-t border-hairline px-3 py-3">
              <span className="text-[13px] font-medium text-ink-500">Summe</span>
              <Money.Text value={groupSumFmt} className="min-w-[104px] text-right" />
            </div>
```

- [ ] **Step 6: Leerzustand**

```tsx
          <EmptyState
            title="Keine Umsätze gefunden"
            message="Passe die Filter an oder importiere eine CSV-Datei."
          />
```

- [ ] **Step 7: Prüfen**

Run: `npm run build` → erfolgreich.
Run: `grep -n "dark:" src/components/transactions/tx-view.tsx` → keine Ausgabe.
Sichtprüfung `/transactions`: Avatare mit Initialen, Kategorie-Badges, rechtsbündige Beträge, Filter-Pillen, Chips entfernbar.

- [ ] **Step 8: Commit**

```bash
git add src/components/transactions/ src/app/\(app\)/transactions/page.tsx
git commit -m "feat(transactions): DS-Zeilen, Filter-Pillen und Datumsgruppen"
```

---

## Task 17: Verträge-Screen

**Files:**
- Modify: `src/components/contracts/contracts-view.tsx`
- Modify: `src/app/(app)/contracts/page.tsx`

**Interfaces:**
- Consumes: `SegmentedControl`, `KpiCard`, `MerchantAvatar`, `Money`, `EmptyState`, `Badge`

IA laut Readme: Summary-Card (Abos & Verträge / pro Monat / N aktiv), Segmented (Aktiv/Einnahmen/Beendet), Vertragskarten.

- [ ] **Step 1: Bestehende View lesen**

Run: `cat src/components/contracts/contracts-view.tsx`

Notieren: wie der Aktiv/Beendet-Filter heute umgesetzt ist, welche Felder die Verträge haben.

- [ ] **Step 2: Summary-Card**

Über der Liste:

```tsx
      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-3">
        <KpiCard label="Pro Monat" value={monthlySumFmt} tone="expense" />
        <KpiCard label="Aktive Verträge" value={String(activeCount)} tone="neutral" icon={Repeat} />
        <KpiCard label="Einnahmen / Monat" value={incomeSumFmt} tone="income" />
      </div>
```

Werte aus den bereits geladenen Vertragsdaten ableiten — **keine neue Query.**

- [ ] **Step 3: Segmented statt bisherigem Filter**

```tsx
      <SegmentedControl
        options={[
          { value: "aktiv", label: "Aktiv" },
          { value: "einnahmen", label: "Einnahmen" },
          { value: "beendet", label: "Beendet" },
        ]}
        value={status}
        onChange={setStatus}
      />
```

- [ ] **Step 4: Vertragskarten**

```tsx
          <Card key={c.id} size="sm">
            <CardContent className="flex items-center gap-3.5">
              <MerchantAvatar name={c.merchant} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink-900">{c.merchant}</span>
                  <Repeat className="size-3.5 shrink-0 text-ink-400" strokeWidth={2} />
                </div>
                <div className="mt-0.5 text-xs text-ink-400">{c.intervalLabel} · nächste {c.nextFmt}</div>
              </div>
              {c.ended && <Badge variant="secondary">Beendet</Badge>}
              <Money.Text value={c.amountFmt} tone={c.isIncome ? "income" : "neutral"} className="min-w-[104px] text-right" />
            </CardContent>
          </Card>
```

- [ ] **Step 5: Leerzustand**

```tsx
        <EmptyState
          icon={Repeat}
          title="Noch keine Verträge erkannt"
          message="Sobald wiederkehrende Buchungen auftauchen, findest du sie hier."
        />
```

- [ ] **Step 6: Prüfen**

Run: `npm run build` → erfolgreich.
Run: `grep -n "dark:" src/components/contracts/contracts-view.tsx` → keine Ausgabe.
Sichtprüfung `/contracts`.

- [ ] **Step 7: Commit**

```bash
git add src/components/contracts/ src/app/\(app\)/contracts/page.tsx
git commit -m "feat(contracts): Summary-KPIs, SegmentedControl und DS-Vertragskarten"
```

---

## Task 18: Analyse-Screen

**Files:**
- Modify: `src/components/analysis/analysis-view.tsx`
- Modify: `src/app/(app)/analysis/page.tsx`

**Interfaces:**
- Consumes: `SegmentedControl`, `KpiCard`, `MerchantAvatar`, `Money`, `EmptyState`

IA laut Readme: Zeitraum-Toggle (Monat/3 Monate/1 Jahr), KPI Einnahmen/Ausgaben, Ausgaben nach Kategorie (Donut), Einnahmen vs. Ausgaben (6 Monate, Balken), Top-Händler.

- [ ] **Step 1: Bestehende View lesen**

Run: `cat src/components/analysis/analysis-view.tsx`

Notieren: wie der Zeitraum-Toggle heute umgesetzt ist, welche Daten für Top-Händler vorliegen.

- [ ] **Step 2: Zeitraum-Toggle in den PageHeader**

```tsx
      <PageHeader
        title="Analyse"
        lead="Wofür dein Geld draufgeht."
        right={
          <SegmentedControl
            options={[
              { value: "month", label: "Monat" },
              { value: "quarter", label: "3 Monate" },
              { value: "year", label: "1 Jahr" },
            ]}
            value={range}
            onChange={setRange}
          />
        }
      />
```

Die `value`-Schlüssel an die im Code vorhandenen Range-Werte anpassen.

- [ ] **Step 3: KPI-Paar**

```tsx
      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-2">
        <KpiCard label="Einnahmen" value={incomeFmt} tone="income" />
        <KpiCard label="Ausgaben" value={expensesFmt} tone="expense" />
      </div>
```

- [ ] **Step 4: Top-Händler-Liste**

```tsx
        <Card>
          <CardHeader>
            <CardTitle>Top-Händler</CardTitle>
          </CardHeader>
          <CardContent>
            {topMerchants.length === 0 ? (
              <EmptyState compact title="Noch keine Daten" message="Es gibt in diesem Zeitraum keine Umsätze." />
            ) : (
              topMerchants.map((m) => (
                <div key={m.name} className="flex items-center gap-3 border-b border-hairline py-3 last:border-0">
                  <MerchantAvatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-900">{m.name}</div>
                    <div className="text-xs text-ink-400">{m.count} Buchungen</div>
                  </div>
                  <Money.Text value={m.sumFmt} className="min-w-[104px] text-right" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
```

- [ ] **Step 5: Prüfen**

Run: `npm run build` → erfolgreich.
Run: `grep -n "dark:" src/components/analysis/analysis-view.tsx` → keine Ausgabe.
Sichtprüfung `/analysis`: Toggle rechts im Header, KPI-Paar getönt, Donut und Balken in DS-Farben.

- [ ] **Step 6: Commit**

```bash
git add src/components/analysis/ src/app/\(app\)/analysis/page.tsx
git commit -m "feat(analysis): Zeitraum-Toggle, KPI-Paar und Top-Händler in DS-Optik"
```

---

## Task 19: Einstellungen-Seiten

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`, `settings/connections/page.tsx`, `settings/connections/connect-picker.tsx`, `settings/fints/page.tsx`, `settings/fints/fints-connect.tsx`, `settings/import/page.tsx`, `settings/import/import-form.tsx`, `settings/review/page.tsx`

**Interfaces:**
- Consumes: `EmptyState`, `Badge`, `Money`, `PageHeader`

Diese Seiten behalten ihr Layout. Ziel ist nur, dass nichts optisch aus dem System fällt.

- [ ] **Step 1: `dark:`-Reste entfernen**

Run: `grep -rn "dark:" src/app/`
Expected: Treffer in `settings/connections/page.tsx`.

Jedes `dark:`-Fragment ersatzlos streichen.

- [ ] **Step 2: Status- und Warnfarben auf DS-Tokens**

Ersetzen:
- `text-amber-*` / `bg-amber-*` → `text-review` / `bg-review-soft`
- `text-emerald-*` / `text-green-*` → `text-income` / `bg-income-soft`
- `text-rose-*` / `text-red-*` / `bg-destructive/10` → `text-expense-strong` / `bg-expense-soft`
- `text-muted-foreground` bleibt (mappt über die Bridge auf `--ink-500`)

Run: `grep -rnE "amber-|emerald-|rose-|green-|red-|slate-|zinc-|gray-|neutral-" src/`
Expected nach der Bearbeitung: keine Ausgabe.

- [ ] **Step 3: Leere Listen auf EmptyState**

Wo heute ein nackter `<p className="text-sm text-muted-foreground">` als Leerzustand steht (Verbindungen, Review-Queue), durch `<EmptyState compact … />` ersetzen. Texte in "du"-Ansprache, ohne Ausrufezeichen.

- [ ] **Step 4: PageHeader-Props**

Sicherstellen, dass alle Settings-Seiten `lead=` statt `description=` nutzen (siehe Task 13).

- [ ] **Step 5: Prüfen**

Run: `npm run build` → erfolgreich.
Run: `npm run lint` → grün.
Sichtprüfung: `/settings`, `/settings/connections`, `/settings/import`, `/settings/review`, `/settings/fints`.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/settings/
git commit -m "feat(settings): Einstellungen auf DS-Tokens und Leerzustände"
```

---

## Task 20: Abschlussverifikation

**Files:** keine Änderung außer gefundenen Nacharbeiten.

- [ ] **Step 1: Keine Dark-Mode-Reste**

Run: `grep -rn "dark:" src/`
Expected: **keine Ausgabe.**

Run: `grep -rn "\.dark\|prefers-color-scheme" src/app/globals.css`
Expected: keine Ausgabe.

- [ ] **Step 2: Keine Fremdfarben**

Run: `grep -rnE "(text|bg|border|fill|stroke)-(slate|zinc|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-[0-9]" src/`
Expected: **keine Ausgabe.** Jeder Treffer ist eine Farbe außerhalb des Design Systems.

- [ ] **Step 3: Keine Emojis**

Run: `grep -rnP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" src/ --include=*.tsx --include=*.ts`
Expected: keine Ausgabe.

- [ ] **Step 4: Volle Testsuite**

Run: `npm test`
Expected: PASS. Falls DB-Tests wegen fehlender Postgres-Instanz scheitern, das gesondert melden — es ist kein Ergebnis dieser Arbeit.

- [ ] **Step 5: Build und Lint**

Run: `npm run build && npm run lint`
Expected: beide grün, keine Warnung über ungenutzte Imports.

- [ ] **Step 6: Manuelle Abnahme aller Screens**

Run: `npm run dev`

Jeden Punkt einzeln prüfen und abhaken:
- [ ] `/dashboard` — Gesamtsaldo als marine Kachel, Einnahmen grün getönt, Ausgaben rot getönt, Donut in DS-Farben, Konten- und Abbuchungsliste mit rechtsbündigen Space-Grotesk-Beträgen
- [ ] `/transactions` — Suche, Filter-Pillen, entfernbare Chips, Avatare mit Initialen, Datumsgruppen, Summenzeile
- [ ] `/contracts` — Summary-KPIs, SegmentedControl mit marine aktivem Segment, Vertragskarten
- [ ] `/analysis` — Zeitraum-Toggle rechts im Header, KPI-Paar, Donut, Balken grün/rot, Top-Händler
- [ ] `/settings` und alle vier Unterseiten — keine Fremdfarben, Leerzustände in "du"-Ansprache
- [ ] Aktiver Nav-Eintrag überall als gefüllte Marine-Pille mit weichem Schatten
- [ ] Negative Beträge zeigen `−` (U+2212), nicht `-`
- [ ] Mobile-Breakpoint 390px: Bottom-Tabs sichtbar, KPI-Kacheln gestapelt, keine horizontale Scrollleiste
- [ ] Fokus per Tastatur sichtbar: 3px Marine-Ring auf Buttons, Inputs, Nav-Links

- [ ] **Step 7: Gefundene Abweichungen nacharbeiten und committen**

Jede Abweichung beheben, dann:

```bash
git add -A
git commit -m "fix(ui): Nacharbeiten aus der DS-Abschlussverifikation"
```

---

## Offene Punkte für den Menschen

- **`Design-System/` ist untracked.** Entscheidung, ob das Handoff-ZIP ins Repo kommt, liegt beim Projektinhaber. `Design-System/unpacked/` sollte in keinem Fall eingecheckt werden — dafür `Design-System/unpacked/` in `.gitignore` aufnehmen.
- **Branch:** Diese Arbeit gehört nicht auf `feat/fints-integration`. Vor Task 1 einen eigenen Branch anlegen.
- **Fonts:** Das DS-Readme bittet um lizenzierte Geist/General-Sans-Dateien. Mit Geist via `next/font` ist diese Bitte erfüllt; `tokens/fonts.css` (Inter via Google CDN) wird bewusst nicht übernommen.
