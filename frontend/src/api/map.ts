import { apiRequest } from "./client";
import type { ClosureAreaRelations, ClosureScenario, ClosureScenarioWrite, MapFeatureCollection, MapSearchResult } from "../types/map";

export interface NetworkSummary {
  active_addresses: number;
  valves: number;
  active_pipes: number;
  active_closure_areas: number;
}

export const getAddresses = () => apiRequest<MapFeatureCollection>("/addresses");
export const getValves = () => apiRequest<MapFeatureCollection>("/valves");
export const getPipes = () => apiRequest<MapFeatureCollection>("/pipes");
export const getClosureAreas = () => apiRequest<MapFeatureCollection>("/closure-areas");
export const getNetworkSummary = () => apiRequest<NetworkSummary>("/network-summary");
export const getClosureAreaRelations = (id: string) => apiRequest<ClosureAreaRelations>(`/closure-areas/${encodeURIComponent(id)}/relations`);
export const updateClosureAreaRelations = (id: string, payload: Pick<ClosureAreaRelations, "address_ids">) => apiRequest<ClosureAreaRelations>(`/closure-areas/${encodeURIComponent(id)}/relations`, { method: "PUT", body: JSON.stringify(payload) });
export const getClosureScenarios = (areaId = "") => apiRequest<ClosureScenario[]>(`/closure-scenarios${areaId ? `?closure_area_id=${encodeURIComponent(areaId)}` : ""}`);
export const createClosureScenario = (payload: ClosureScenarioWrite) => apiRequest<ClosureScenario>("/closure-scenarios", { method: "POST", body: JSON.stringify(payload) });
export const updateClosureScenario = (id: string, payload: ClosureScenarioWrite) => apiRequest<ClosureScenario>(`/closure-scenarios/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteClosureScenario = (id: string) => apiRequest<void>(`/closure-scenarios/${encodeURIComponent(id)}`, { method: "DELETE" });

export function searchMap(query: string) {
  return apiRequest<MapSearchResult[]>(`/map/search?q=${encodeURIComponent(query)}`);
}
