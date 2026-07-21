import { db } from "./index";
import { categories } from "./schema";

type SeedCat = {
  slug: string;
  name: string;
  parent?: string;
  icon?: string;
  color?: string;
  kind?: "expense" | "income" | "transfer" | "excluded" | "saving";
};

// Taxonomie aus Spec §7.4 — 16 Hauptkategorien mit Unterkategorien.
const TAXONOMY: SeedCat[] = [
  { slug: "einkommen", name: "Einkommen", icon: "wallet", color: "#16a34a", kind: "income" },
  { slug: "einkommen-gehalt", name: "Gehalt", parent: "einkommen", kind: "income" },
  { slug: "einkommen-nebeneinkommen", name: "Nebeneinkommen", parent: "einkommen", kind: "income" },
  { slug: "einkommen-erstattungen", name: "Erstattungen", parent: "einkommen", kind: "income" },
  { slug: "einkommen-zinsen-dividenden", name: "Zinsen & Dividenden", parent: "einkommen", kind: "income" },

  { slug: "wohnen", name: "Wohnen", icon: "home", color: "#f59e0b" },
  { slug: "wohnen-miete", name: "Miete", parent: "wohnen" },
  { slug: "wohnen-energie", name: "Energie", parent: "wohnen" },
  { slug: "wohnen-internet-mobilfunk", name: "Internet & Mobilfunk", parent: "wohnen" },
  { slug: "wohnen-moebel-hausrat", name: "Möbel & Hausrat", parent: "wohnen" },
  { slug: "wohnen-rundfunk", name: "Rundfunkbeitrag", parent: "wohnen" },

  { slug: "lebensmittel", name: "Lebensmittel", icon: "shopping-cart", color: "#22c55e" },
  { slug: "lebensmittel-supermarkt", name: "Supermarkt", parent: "lebensmittel" },
  { slug: "lebensmittel-drogerie", name: "Drogerie", parent: "lebensmittel" },
  { slug: "lebensmittel-baeckerei", name: "Bäckerei", parent: "lebensmittel" },

  { slug: "restaurants-bars", name: "Restaurants & Bars", icon: "utensils", color: "#ef4444" },
  { slug: "restaurants-bars-restaurant", name: "Restaurant", parent: "restaurants-bars" },
  { slug: "restaurants-bars-cafe", name: "Café", parent: "restaurants-bars" },
  { slug: "restaurants-bars-lieferdienst", name: "Lieferdienst", parent: "restaurants-bars" },
  { slug: "restaurants-bars-bar-ausgehen", name: "Bar & Ausgehen", parent: "restaurants-bars" },

  { slug: "mobilitaet", name: "Mobilität", icon: "car", color: "#3b82f6" },
  { slug: "mobilitaet-oepnv-bahn", name: "ÖPNV & Bahn", parent: "mobilitaet" },
  { slug: "mobilitaet-auto-tanken", name: "Auto & Tanken", parent: "mobilitaet" },
  { slug: "mobilitaet-carsharing-taxi", name: "Carsharing & Taxi", parent: "mobilitaet" },
  { slug: "mobilitaet-fahrrad", name: "Fahrrad", parent: "mobilitaet" },

  { slug: "shopping", name: "Shopping", icon: "shopping-bag", color: "#ec4899" },
  { slug: "shopping-kleidung", name: "Kleidung", parent: "shopping" },
  { slug: "shopping-elektronik", name: "Elektronik", parent: "shopping" },
  { slug: "shopping-online-shopping", name: "Online-Shopping", parent: "shopping" },
  { slug: "shopping-buecher-medien", name: "Bücher & Medien", parent: "shopping" },

  { slug: "abos", name: "Abos", icon: "repeat", color: "#8b5cf6" },
  { slug: "abos-streaming", name: "Streaming", parent: "abos" },
  { slug: "abos-software-cloud", name: "Software & Cloud", parent: "abos" },
  { slug: "abos-gaming", name: "Gaming", parent: "abos" },
  { slug: "abos-news", name: "News", parent: "abos" },

  { slug: "versicherungen", name: "Versicherungen", icon: "shield", color: "#0ea5e9" },
  { slug: "versicherungen-haftpflicht", name: "Haftpflicht", parent: "versicherungen" },
  { slug: "versicherungen-hausrat", name: "Hausrat", parent: "versicherungen" },
  { slug: "versicherungen-kfz", name: "Kfz", parent: "versicherungen" },
  { slug: "versicherungen-kranken", name: "Kranken", parent: "versicherungen" },
  { slug: "versicherungen-bu", name: "Berufsunfähigkeit", parent: "versicherungen" },
  { slug: "versicherungen-sonstige", name: "Sonstige Versicherung", parent: "versicherungen" },

  { slug: "gesundheit-fitness", name: "Gesundheit & Fitness", icon: "heart-pulse", color: "#14b8a6" },
  { slug: "gesundheit-fitness-apotheke-arzt", name: "Apotheke & Arzt", parent: "gesundheit-fitness" },
  { slug: "gesundheit-fitness-fitnessstudio", name: "Fitnessstudio", parent: "gesundheit-fitness" },
  { slug: "gesundheit-fitness-sport", name: "Sport", parent: "gesundheit-fitness" },

  { slug: "freizeit-reisen", name: "Freizeit & Reisen", icon: "plane", color: "#f97316" },
  { slug: "freizeit-reisen-urlaub", name: "Urlaub", parent: "freizeit-reisen" },
  { slug: "freizeit-reisen-hotel", name: "Hotel", parent: "freizeit-reisen" },
  { slug: "freizeit-reisen-flug", name: "Flug", parent: "freizeit-reisen" },
  { slug: "freizeit-reisen-events-kultur", name: "Events & Kultur", parent: "freizeit-reisen" },
  { slug: "freizeit-reisen-hobby", name: "Hobby", parent: "freizeit-reisen" },

  { slug: "bildung", name: "Bildung", icon: "graduation-cap", color: "#6366f1" },
  { slug: "sparen-investieren", name: "Sparen & Investieren", icon: "piggy-bank", color: "#84cc16", kind: "saving" },
  { slug: "sparen-investieren-sparen", name: "Sparen", parent: "sparen-investieren", kind: "saving" },
  { slug: "bargeld", name: "Bargeld", icon: "banknote", color: "#a3a3a3" },
  { slug: "gebuehren-zinsen", name: "Gebühren & Zinsen", icon: "percent", color: "#dc2626" },

  { slug: "umbuchung", name: "Umbuchung", icon: "arrow-left-right", color: "#94a3b8", kind: "transfer" },
  { slug: "sonstiges", name: "Sonstiges", icon: "circle", color: "#94a3b8" },
];

async function main() {
  // Erst Hauptkategorien (ohne parent), dann Unterkategorien mit parentId.
  const bySlug = new Map<string, string>();

  for (const c of TAXONOMY.filter((c) => !c.parent)) {
    const [row] = await db
      .insert(categories)
      .values({
        slug: c.slug,
        name: c.name,
        icon: c.icon ?? "circle",
        color: c.color ?? "#8884d8",
        kind: c.kind ?? "expense",
        sort: 0,
      })
      .onConflictDoNothing({ target: categories.slug })
      .returning();
    if (row) bySlug.set(c.slug, row.id);
  }

  // Für idempotenten Re-Run: fehlende parent-IDs aus DB nachladen.
  const existing = await db.select().from(categories);
  for (const row of existing) bySlug.set(row.slug, row.id);

  let i = 0;
  for (const c of TAXONOMY.filter((c) => c.parent)) {
    await db
      .insert(categories)
      .values({
        slug: c.slug,
        name: c.name,
        parentId: bySlug.get(c.parent!) ?? null,
        icon: c.icon ?? "circle",
        color: c.color ?? bySlug.get(c.parent!) ? "#8884d8" : "#8884d8",
        kind: c.kind ?? "expense",
        sort: ++i,
      })
      .onConflictDoNothing({ target: categories.slug });
  }

  // bySlug erneut auffrischen: enthält nach dem obigen Insert-Loop auch neu angelegte Unterkategorien
  // (der obige onConflictDoNothing-Insert liefert kein returning(), also sonst fehlt die frisch erzeugte ID).
  for (const row of await db.select().from(categories)) bySlug.set(row.slug, row.id);

  // Idempotenter Abgleich: kind von sparen-investieren aktualisieren (onConflict oben updated nicht).
  const { eq } = await import("drizzle-orm");
  await db.update(categories).set({ kind: "saving" }).where(eq(categories.slug, "sparen-investieren"));

  // Sparplan-Regel seeden: Verwendungszweck enthält "Sparplan" -> Sparen.
  const { categoryRules } = await import("./schema");
  const sparenId = bySlug.get("sparen-investieren-sparen");
  if (sparenId) {
    const existing = await db
      .select()
      .from(categoryRules)
      .where(eq(categoryRules.value, "Sparplan"));
    if (existing.length === 0) {
      await db.insert(categoryRules).values({
        field: "purpose",
        op: "contains",
        value: "Sparplan",
        categoryId: sparenId,
        createdFrom: "manual",
        priority: 10,
      });
    }
  }

  const count = (await db.select().from(categories)).length;
  console.log(`Seed fertig: ${count} Kategorien.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
