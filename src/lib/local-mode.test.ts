import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isEnableBankingEnabled,
  isLlmEnabled,
  isStrictLocalMode,
  llmBaseUrl,
} from "./local-mode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("strict local mode", () => {
  it("blocks cloud LLM endpoints and Enable Banking", () => {
    vi.stubEnv("STRICT_LOCAL_MODE", "true");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");

    expect(isStrictLocalMode()).toBe(true);
    expect(() => llmBaseUrl()).toThrow("nur über localhost");
    expect(isEnableBankingEnabled()).toBe(false);
  });

  it("allows an explicitly enabled loopback LLM", () => {
    vi.stubEnv("STRICT_LOCAL_MODE", "true");
    vi.stubEnv("LLM_ENABLED", "true");
    vi.stubEnv("OPENROUTER_BASE_URL", "http://127.0.0.1:11434/v1/");

    expect(isLlmEnabled()).toBe(true);
    expect(llmBaseUrl()).toBe("http://127.0.0.1:11434/v1");
  });

  it("can disable LLM calls completely", () => {
    vi.stubEnv("LLM_ENABLED", "false");
    expect(isLlmEnabled()).toBe(false);
  });
});
