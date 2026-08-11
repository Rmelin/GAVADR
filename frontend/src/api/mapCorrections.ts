import { apiRequest } from "./client";
import type { CorrectionTransitionPayload, MapCorrection, MapCorrectionCreatePayload, MapCorrectionPatchPayload } from "../types/mapCorrections";
import { listParams, type ListFilters } from "./queryParams";

export function getMapCorrections(filters: ListFilters = {}) {
  const params = listParams(filters);
  const query = params.toString();
  return apiRequest<MapCorrection[]>(`/map-corrections${query ? `?${query}` : ""}`);
}
export const getMapCorrection = (id: string) => apiRequest<MapCorrection>(`/map-corrections/${id}`);
export const createMapCorrection = (payload: MapCorrectionCreatePayload) => apiRequest<MapCorrection>("/map-corrections", { method: "POST", body: JSON.stringify(payload) });
export const updateMapCorrection = (id: string, payload: MapCorrectionPatchPayload) => apiRequest<MapCorrection>(`/map-corrections/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const transitionMapCorrection = (id: string, payload: CorrectionTransitionPayload) => apiRequest<MapCorrection>(`/map-corrections/${id}/transitions`, { method: "POST", body: JSON.stringify(payload) });
export function uploadMapCorrectionAttachment(id: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<MapCorrection>(`/map-corrections/${id}/attachments`, { method: "POST", body });
}
