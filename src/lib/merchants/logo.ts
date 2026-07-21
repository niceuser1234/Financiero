import { matchBrand } from "@/lib/classify/normalize";

/**
 * Domain-Map für Händler-Logos. Brand-Aliase haben bereits domain;
 * zusätzlich häufige DE-Händler ohne festes Alias-Regex.
 */
const EXTRA_DOMAINS: Record<string, string> = {
  spotify: "spotify.com",
  netflix: "netflix.com",
  amazon: "amazon.de",
  rewe: "rewe.de",
  aldi: "aldi-nord.de",
  lidl: "lidl.de",
  dm: "dm.de",
  rossmann: "rossmann.de",
  "deutsche bahn": "bahn.de",
  vinted: "vinted.de",
  paypal: "paypal.com",
  "egym wellpass": "egym.com",
  viactiv: "viactiv.de",
  nextbike: "nextbike.de",
  "anthropic claude": "claude.ai",
  cursor: "cursor.com",
  perplexity: "perplexity.ai",
  openai: "openai.com",
  apple: "apple.com",
  "apple services": "apple.com",
  konsum: "konsum-leipzig.de",
  playtomic: "playtomic.com",
  edeka: "edeka.de",
  "go asia": "goasia.de",
};

function slugCandidates(name: string): string[] {
  const n = name.toLowerCase().trim();
  const parts = n.split(/\s+/).filter(Boolean);
  const out = [n];
  if (parts.length > 1) {
    out.push(parts[0]!);
    out.push(parts.slice(0, 2).join(" "));
  }
  return out;
}

/** Liefert eine Logo-URL (Google Favicon Service) oder null. */
export function logoUrlFor(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const brand = matchBrand(name);
  const domain =
    brand?.domain ??
    slugCandidates(name)
      .map((s) => EXTRA_DOMAINS[s])
      .find(Boolean);

  if (!domain) return null;
  // sz=128 liefert ausreichend scharfe Icons für 38px Avatare.
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}
