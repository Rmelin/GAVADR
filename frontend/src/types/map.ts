import type { Feature, FeatureCollection, Geometry } from "geojson";

export type MapLayerId = "closureAreas" | "pipes" | "valves" | "addresses" | "plannedShutdowns" | "activeShutdowns" | "newIncidents" | "activeIncidents";

export type MapPropertyPrimitive = boolean | number | string | null;
export interface ClosureScenario {
  id: string;
  name: string;
  area_ids: string[];
  valve_ids: string[];
  updated_at: string;
}
export interface ClosureScenarioWrite {
  name: string;
  area_ids: string[];
  valve_ids: string[];
  expected_updated_at?: string;
}
export type MapPropertyValue = MapPropertyPrimitive | MapPropertyPrimitive[] | ClosureScenario[] | undefined;

export type MapProperties = Record<string, MapPropertyValue> & {
  id?: string;
  code?: string;
  name?: string;
  label?: string;
  pipe_type?: string;
  valve_ids?: (string | number)[];
  address_ids?: (string | number)[];
  kind?: "incident" | "shutdown";
  status?: string;
  title?: string;
  url?: string;
  closure_scenarios?: ClosureScenario[];
};

export type MapFeature = Feature<Geometry, MapProperties>;
export type MapFeatureCollection = FeatureCollection<Geometry, MapProperties>;

export interface MapSearchResult {
  id: string;
  type: string;
  label: string;
  subtitle: string;
  longitude: number;
  latitude: number;
}

export interface LayerState {
  closureAreas: boolean;
  pipes: boolean;
  valves: boolean;
  addresses: boolean;
  plannedShutdowns: boolean;
  activeShutdowns: boolean;
  newIncidents: boolean;
  activeIncidents: boolean;
}

export type MapSelection =
  | { kind: "feature"; feature: MapFeature }
  | { kind: "search"; result: MapSearchResult };

export type SelectableMapKind = "valve" | "closureArea";

export interface SelectedMapItem {
  id: string;
  kind: SelectableMapKind;
  feature: MapFeature;
}

export interface ClosureAreaRelations {
  closure_area_id: string;
  valve_ids: string[];
  scenarios: ClosureScenario[];
  address_ids: string[];
  candidate_address_ids: string[];
}
