import { apiRequest } from "./client";

export interface AppSettings {
  organization_name: string;
  organization_address: string;
  organization_locality: string;
  map_default_longitude: number;
  map_default_latitude: number;
  map_default_zoom: number;
  updated_at: string | null;
}

export interface AddressImportError { row: number; message: string }
export interface AddressImportReport {
  filename: string;
  rows: number;
  new_rows: number;
  skipped_rows: number;
  created_rows: number;
  errors: AddressImportError[];
  committed: boolean;
}

export const defaultAppSettings: AppSettings = {
  organization_name: "GAVAD",
  organization_address: "",
  organization_locality: "",
  map_default_longitude: 11.45,
  map_default_latitude: 55.62,
  map_default_zoom: 13,
  updated_at: null,
};

export const getPublicAppSettings = () => apiRequest<AppSettings>("/app-settings/public");
export const updateAppSettings = (payload: Omit<AppSettings, "updated_at">) => apiRequest<AppSettings>("/app-settings", { method: "PUT", body: JSON.stringify(payload) });
export function importAddresses(file: File, crs: "EPSG:25832" | "EPSG:4326", commit: boolean) {
  const body = new FormData();
  body.append("file", file);
  body.append("crs", crs);
  body.append("commit", String(commit));
  return apiRequest<AddressImportReport>("/app-settings/address-import", { method: "POST", body });
}
