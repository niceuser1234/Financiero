/**
 * Single-User-App ohne Login: keine Session-Prüfung.
 * Die Funktionen bleiben als No-Op erhalten, damit bestehende Aufrufstellen
 * (Server Actions) unverändert weiterlaufen.
 */
export async function requireSession(): Promise<void> {}

export async function getSession(): Promise<null> {
  return null;
}
