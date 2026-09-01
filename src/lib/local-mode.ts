import "server-only";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isStrictLocalMode(): boolean {
  return process.env.STRICT_LOCAL_MODE === "true";
}

export function isLlmEnabled(): boolean {
  return process.env.LLM_ENABLED !== "false";
}

export function llmBaseUrl(): string {
  const raw = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const url = new URL(raw);

  if (isStrictLocalMode() && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      "STRICT_LOCAL_MODE erlaubt LLM-Aufrufe nur über localhost/127.0.0.1",
    );
  }

  return url.toString().replace(/\/$/, "");
}

export function isEnableBankingEnabled(): boolean {
  return !isStrictLocalMode() && process.env.ENABLE_BANKING_ENABLED !== "false";
}
