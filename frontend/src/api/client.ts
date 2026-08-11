const API_ROOT = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ValidationIssue {
  type?: string;
  loc?: Array<string | number>;
  msg?: string;
  ctx?: Record<string, unknown>;
}

const fieldLabels: Record<string, string> = {
  title: "Titel",
  description: "Beskrivelse",
  starts_at: "Start",
  expected_end_at: "Slut",
  assigned_to_id: "Ansvarlig",
  contractor: "Entreprenør",
  valve_ids: "Hane",
  address_id: "Adresse",
};

function validationMessage(issue: ValidationIssue) {
  const path = issue.loc?.filter((part) => part !== "body") ?? [];
  const field = path.find((part): part is string => typeof part === "string");
  const index = path.find((part): part is number => typeof part === "number");
  const label = `${fieldLabels[field ?? ""] ?? field ?? "Felt"}${index === undefined ? "" : ` ${index + 1}`}`;

  if (issue.type === "uuid_parsing" || issue.type === "uuid_type") return `${label}: Ugyldigt ID.`;
  if (issue.type === "datetime_from_date_parsing" || issue.type === "datetime_parsing") return `${label}: Ugyldigt tidspunkt.`;
  if (issue.type === "string_too_long") return `${label}: Må højst indeholde ${String(issue.ctx?.max_length ?? "det tilladte antal")} tegn.`;
  if (issue.type === "string_too_short") return `${label}: Indeholder for få tegn.`;
  if (issue.type === "missing") return `${label}: Feltet skal udfyldes.`;
  return `${label}: ${issue.msg ?? "Ugyldig værdi."}`;
}

function errorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const response = body as { detail?: unknown; message?: unknown };
  if (typeof response.detail === "string") return response.detail;
  if (Array.isArray(response.detail)) {
    const messages = response.detail
      .filter((issue): issue is ValidationIssue => Boolean(issue) && typeof issue === "object")
      .map(validationMessage);
    if (messages.length) return messages.join(" ");
  }
  if (typeof response.message === "string") return response.message;
  return fallback;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let message = "Der opstod en fejl. Prøv igen.";
    try {
      message = errorMessage(await response.json(), message);
    } catch {
      // Keep the safe Danish fallback when the server does not return JSON.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
