import { apiRequest } from "./client";
import type { IncidentCreatePayload, IncidentDetail, IncidentSummary, UserOption } from "../types/incidents";
import { listParams } from "./queryParams";

export function getIncidents(filters: { status?: string[]; priority?: string }) {
  const params = listParams(filters);
  const query = params.toString();
  return apiRequest<IncidentSummary[]>(`/incidents${query ? `?${query}` : ""}`);
}

export const getIncident = (id: string) => apiRequest<IncidentDetail>(`/incidents/${id}`);
export const createIncident = (payload: IncidentCreatePayload) => apiRequest<IncidentDetail>("/incidents", { method: "POST", body: JSON.stringify(payload) });
export const updateIncident = (id: string, payload: Record<string, unknown>) => apiRequest<IncidentDetail>(`/incidents/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const addIncidentUpdate = (id: string, payload: { message: string; status?: string }) => apiRequest<IncidentDetail>(`/incidents/${id}/updates`, { method: "POST", body: JSON.stringify(payload) });
export function uploadIncidentAttachment(id: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<IncidentDetail>(`/incidents/${id}/attachments`, { method: "POST", body });
}
export const getUserOptions = () => apiRequest<UserOption[]>("/users/options");
