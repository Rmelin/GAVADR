import { apiRequest } from "./client";
import type { PlannedShutdownCreatePayload, PlannedShutdownDetail, PlannedShutdownSummary } from "../types/plannedShutdowns";
import { listParams } from "./queryParams";

export function getPlannedShutdowns(status: string[] = []) {
  const query = listParams({ status }).toString();
  return apiRequest<PlannedShutdownSummary[]>(`/planned-shutdowns${query ? `?${query}` : ""}`);
}

export const getPlannedShutdown = (id: string) => apiRequest<PlannedShutdownDetail>(`/planned-shutdowns/${id}`);
export async function createPlannedShutdown(payload: PlannedShutdownCreatePayload) {
  const { included_address_ids = [], ...shutdown } = payload;
  let result = await apiRequest<PlannedShutdownDetail>("/planned-shutdowns", { method: "POST", body: JSON.stringify(shutdown) });
  for (const address_id of included_address_ids) {
    result = await apiRequest<PlannedShutdownDetail>(`/planned-shutdowns/${result.id}/addresses`, { method: "POST", body: JSON.stringify({ address_id }) });
  }
  return result;
}
export const updatePlannedShutdown = (id: string, payload: Record<string, unknown>) => apiRequest<PlannedShutdownDetail>(`/planned-shutdowns/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const updateShutdownAddress = (id: string, addressId: string, payload: { included?: boolean; informed?: boolean }) => apiRequest<PlannedShutdownDetail>(`/planned-shutdowns/${id}/addresses/${addressId}`, { method: "PATCH", body: JSON.stringify(payload) });
export const addShutdownAddress = (id: string, address_id: string) => apiRequest<PlannedShutdownDetail>(`/planned-shutdowns/${id}/addresses`, { method: "POST", body: JSON.stringify({ address_id }) });
export const updateAllShutdownAddresses = (id: string, informed: boolean) => apiRequest<PlannedShutdownDetail>(`/planned-shutdowns/${id}/addresses/informed`, { method: "PATCH", body: JSON.stringify({ informed }) });
export const updateShutdownIncidents = (id: string, incident_ids: string[]) => apiRequest<PlannedShutdownDetail>(`/planned-shutdowns/${id}/incidents`, { method: "PUT", body: JSON.stringify({ incident_ids }) });
export const shutdownCsvUrl = (id: string) => `/api/planned-shutdowns/${id}/addresses.csv`;
