import { describe, expect, it } from "vitest";
import { fintsSidecarError, fintsSidecarUnavailable } from "./fints-sidecar-error";

function response(status: number, body: string): Response {
  return {
    status,
    text: async () => body,
  } as Response;
}

describe("fintsSidecarError", () => {
  it("shows a structured bank error without the raw JSON envelope", async () => {
    const error = await fintsSidecarError(response(503, JSON.stringify({
      detail: {
        code: "product_registration_pending",
        message: "Die DKB kennt die FinTS-Produkt-ID noch nicht (Bankcode 9078).",
      },
    })));

    expect(error.message).toBe(
      "Die DKB kennt die FinTS-Produkt-ID noch nicht (Bankcode 9078).",
    );
  });

  it("does not expose an unknown response body", async () => {
    const error = await fintsSidecarError(response(500, "internal details"));
    expect(error.message).toBe(
      "Der lokale FinTS-Dienst ist fehlgeschlagen (HTTP 500).",
    );
  });
});

describe("fintsSidecarUnavailable", () => {
  it("explains how to start both local services", () => {
    expect(fintsSidecarUnavailable().message).toContain("npm run dev:local");
  });
});
