import { readFileSync } from "node:fs";
import path from "node:path";

// Lädt .env in process.env für DB-Tests (Vitest lädt .env nicht automatisch).
try {
  const raw = readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").split("#")[0].trim();
    }
  }
} catch {
  // keine .env — CI setzt Vars direkt
}
