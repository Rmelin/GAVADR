export type IncidentPriority = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "new" | "assessing" | "active" | "monitoring" | "resolved" | "closed" | "cancelled";
export type IncidentType = "suspected_leak" | "confirmed_leak" | "pressure_drop" | "no_water" | "discolored_water" | "planned_work" | "defective_valve" | "map_error" | "other_operational_disruption";
export type ActivityType = "break" | "shutdown" | "excavation" | "other_incident";

export interface IncidentPerson {
  id: string;
  display_name: string;
}

export interface IncidentLocation {
  longitude: number;
  latitude: number;
}

export interface IncidentAddress {
  id: string;
  label: string;
  street_name: string;
  house_number: string;
  postal_code: string;
  city: string;
}

export interface IncidentSummary {
  id: string;
  number: string;
  title: string;
  type: IncidentType;
  priority: IncidentPriority;
  status: IncidentStatus;
  location: IncidentLocation;
  address?: IncidentAddress | null;
  assigned_to?: IncidentPerson | null;
  registered_at: string;
  created_by: IncidentPerson;
  updated_at: string;
  expected_end_at?: string | null;
  activity_type: ActivityType;
}

export interface CompactPlannedShutdown {
  id: string;
  number: string;
  title: string;
  status: string;
  starts_at: string;
  activity_type: ActivityType;
}

export interface IncidentUpdate {
  id: string;
  message: string;
  status?: IncidentStatus | null;
  author: IncidentPerson;
  created_at: string;
}

export interface IncidentAttachment {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  download_url: string;
  created_at: string;
}

export interface IncidentDetail extends IncidentSummary {
  description: string;
  public_text?: string | null;
  water_restored_at?: string | null;
  updates: IncidentUpdate[];
  attachments: IncidentAttachment[];
  planned_shutdowns: CompactPlannedShutdown[];
}

export interface IncidentCreatePayload {
  title: string;
  description: string;
  type: string;
  priority: string;
  address_id?: string;
  longitude?: number;
  latitude?: number;
  assigned_to_id?: string;
  expected_end_at?: string;
}

export interface UserOption {
  id: string;
  display_name: string;
  email: string;
}

export const priorityLabels: Record<string, string> = { low: "Lav", medium: "Mellem", high: "Høj", critical: "Kritisk" };
export const statusLabels: Record<IncidentStatus, string> = { new: "Ny", assessing: "Undersøges", active: "Aktiv", monitoring: "Overvåges", resolved: "Løst", closed: "Afsluttet", cancelled: "Annulleret" };
export const typeLabels: Record<IncidentType, string> = { suspected_leak: "Mistanke om brud", confirmed_leak: "Bekræftet brud", pressure_drop: "Trykfald", no_water: "Manglende vand", discolored_water: "Misfarvet vand", planned_work: "Planlagt arbejde", defective_valve: "Defekt hane", map_error: "Kortfejl", other_operational_disruption: "Anden driftsforstyrrelse" };
export const activityTypeLabels: Record<ActivityType, string> = { break: "Brud", shutdown: "Vandlukning", excavation: "Andet gravearbejde", other_incident: "Andre hændelser" };

export const allowedStatusTransitions: Record<IncidentStatus, IncidentStatus[]> = {
  new: ["assessing", "active", "cancelled"],
  assessing: ["active", "monitoring", "resolved", "cancelled"],
  active: ["monitoring", "resolved", "cancelled"],
  monitoring: ["active", "resolved", "cancelled"],
  resolved: ["active", "closed"],
  closed: [],
  cancelled: [],
};

export function canMutateIncidents(roles: string[] | undefined): boolean {
  const editors = ["admin", "board_member", "map_manager"];
  return roles?.some((role) => editors.includes(role)) ?? false;
}
