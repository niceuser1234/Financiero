import "server-only";

const FINTS_PRODUCT_ID_PATTERN = /^[A-Za-z0-9]{1,25}$/;
const FINTS_PRODUCT_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,5}$/;

/**
 * Die FinTS-Produkt-ID identifiziert die Anwendung, nicht den Bankkunden.
 * Die lokale Server-Konfiguration ist deshalb die führende Quelle. Der
 * gespeicherte Wert bleibt nur als Rückwärtskompatibilität für Verbindungen,
 * die vor Einführung von FINTS_PRODUCT_ID angelegt wurden.
 */
export function getFintsProductId(storedProductId?: string | null): string {
  const configuredProductId = process.env.FINTS_PRODUCT_ID?.trim();
  const productId = configuredProductId || storedProductId?.trim() || "";

  if (!productId) {
    throw new Error("FINTS_PRODUCT_ID fehlt in der Server-Konfiguration");
  }
  if (!FINTS_PRODUCT_ID_PATTERN.test(productId)) {
    throw new Error("FINTS_PRODUCT_ID muss aus 1–25 Buchstaben oder Ziffern bestehen");
  }

  return productId;
}

export function getFintsProductVersion(): string {
  const productVersion = (process.env.FINTS_PRODUCT_VERSION ?? "0.1.0").trim();
  if (!FINTS_PRODUCT_VERSION_PATTERN.test(productVersion)) {
    throw new Error(
      "FINTS_PRODUCT_VERSION muss aus 1–5 Buchstaben, Ziffern, Punkt, Unterstrich oder Bindestrich bestehen",
    );
  }
  return productVersion;
}
