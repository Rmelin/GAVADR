import { apiRequest } from "./client";
import type { HistoryFilters, HistoryResponse } from "../types/history";

export function historyParams(filters: HistoryFilters, includePage = true) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  filters.category?.forEach((category) => params.append("category", category));
  if (filters.location?.trim()) params.set("location", filters.location.trim());
  if (includePage && filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (includePage && filters.page_size) params.set("page_size", String(filters.page_size));
  return params;
}

export function getHistory(filters: HistoryFilters) {
  const query = historyParams(filters).toString();
  return apiRequest<HistoryResponse>(`/history${query ? `?${query}` : ""}`);
}

export function historyCsvUrl(filters: HistoryFilters) {
  const query = historyParams(filters, false).toString();
  return `/api/history/export.csv${query ? `?${query}` : ""}`;
}
