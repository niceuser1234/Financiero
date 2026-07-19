import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  return process.env.APP_SIGNING_SECRET ?? "dev-secret";
}

/** Signiertes CSRF-State-Token für den OAuth-Redirect: "<payloadB64>.<hmac>". */
export function signState(payload: Record<string, string>): string {
  const body = Buffer.from(JSON.stringify({ ...payload, n: crypto.randomUUID() })).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(token: string): Record<string, string> | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}
