import type { ActivityType, IncidentStatus, IncidentType, UserOption } from "./incidents";

export type PlannedShutdownStatus = "draft" | "planned" | "in_progress" | "completed" | "cancelled";

export interface ShutdownValve { id: string; code: string }
export interface ShutdownClosureArea { id: string; name: string }
export interface ShutdownAddress {
  id: string;
  street_name?: string;
  house_number?: string;
  postal_code?: string;
  city?: string;
  included: boolean;
  informed: boolean;
  source?: "derived" | "manual";
}

export interface PlannedShutdownSummary {
  id: string;
  number: string;
  title: string;
  description?: string;
  starts_at: string;
  expected_end_at?: string | null;
  status: PlannedShutdownStatus;
  assigned_to?: UserOption | null;
  contractor?: string | null;
  affected_address_count: number;
  informed_address_count: number;
  valve_count: number;
  created_by: UserOption;
  updated_at: string;
  activity_type: ActivityType;
}

export interface CompactIncident {
  id: string;
  number: string;
  title: string;
  type: IncidentType;
  status: IncidentStatus;
  activity_type: ActivityType;
}

export interface PlannedShutdownDetail extends PlannedShutdownSummary {
  valves: ShutdownValve[];
  closure_areas: ShutdownClosureArea[];
  addresses: ShutdownAddress[];
  incidents: CompactIncident[];
}

export interface PlannedShutdownCreatePayload {
  title: string;
  description: string;
  starts_at: string;
  expected_end_at?: string;
  assigned_to_id?: string;
  contractor?: string;
  valve_ids: string[];
  included_address_ids?: string[];
  incident_ids: string[];
}

export const shutdownStatusLabels: Record<PlannedShutdownStatus, string> = {
  draft: "Kladde",
  planned: "Planlagt",
  in_progress: "I gang",
  completed: "Afsluttet",
  cancelled: "Aflyst",
};

export const shutdownStatusTransitions: Record<PlannedShutdownStatus, PlannedShutdownStatus[]> = {
  draft: ["planned", "cancelled"],
  planned: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
};

export const canMutateShutdowns = (roles?: string[]) =>
  Boolean(roles?.some((role) => role === "admin" || role === "board_member"));
