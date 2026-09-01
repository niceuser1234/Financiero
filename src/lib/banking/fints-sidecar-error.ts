interface SidecarErrorBody {
  detail?: string | {
    code?: string;
    message?: string;
  };
}

export async function fintsSidecarError(response: Response): Promise<Error> {
  let body: SidecarErrorBody | undefined;
  try {
    body = JSON.parse(await response.text()) as SidecarErrorBody;
  } catch {
    body = undefined;
  }

  const detail = body?.detail;
  if (typeof detail === "object" && typeof detail.message === "string") {
    return new Error(detail.message);
  }
  if (typeof detail === "string" && detail.trim()) {
    return new Error(`FinTS-Dienst: ${detail}`);
  }
  return new Error(`Der lokale FinTS-Dienst ist fehlgeschlagen (HTTP ${response.status}).`);
}

export function fintsSidecarUnavailable(): Error {
  return new Error(
    "Der lokale FinTS-Dienst ist nicht erreichbar. Bitte Financiero mit „npm run dev:local“ starten.",
  );
}
