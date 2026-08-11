import type { IncidentAttachment, UserOption } from "./incidents";
import type { InquiryPriority } from "./inquiries";
import type { SupplierOption } from "./suppliers";

export type CorrectionStatus = "new" | "assessed" | "assigned" | "sent_to_supplier" | "supplier_accepted" | "work_scheduled" | "work_completed" | "verified" | "closed";

export interface CorrectionHistory {
  id: string;
  previous_status: CorrectionStatus | null;
  status: CorrectionStatus;
  note: string | null;
  author: UserOption;
  created_at: string;
}

export interface MapCorrection {
  id: string;
  number: string;
  title: string;
  description: string;
  category: string;
  priority: InquiryPriority;
  status: CorrectionStatus;
  location: { longitude: number; latitude: number };
  inquiry_id: string | null;
  pipe_id: string | null;
  valve_id: string | null;
  assigned_to: UserOption | null;
  supplier: SupplierOption | null;
  supplier_reference: string | null;
  supplier_due_at: string | null;
  created_by: UserOption;
  history: CorrectionHistory[];
  attachments: IncidentAttachment[];
  created_at: string;
  updated_at: string;
}

export interface MapCorrectionCreatePayload {
  title: string;
  description: string;
  category: string;
  priority?: InquiryPriority;
  longitude: number;
  latitude: number;
  inquiry_id?: string | null;
  pipe_id?: string | null;
  valve_id?: string | null;
  assigned_to_id?: string | null;
  supplier_id?: string | null;
  supplier_reference?: string | null;
  supplier_due_at?: string | null;
}

export type MapCorrectionPatchPayload = Partial<MapCorrectionCreatePayload> & { status?: CorrectionStatus };
export interface CorrectionTransitionPayload { status: CorrectionStatus; note?: string | null }

export const correctionStatuses: CorrectionStatus[] = ["new", "assessed", "assigned", "sent_to_supplier", "supplier_accepted", "work_scheduled", "work_completed", "verified", "closed"];
export const correctionStatusLabels: Record<CorrectionStatus, string> = { new: "Ny", assessed: "Vurderet", assigned: "Tildelt", sent_to_supplier: "Sendt til leverandør", supplier_accepted: "Accepteret af leverandør", work_scheduled: "Arbejde planlagt", work_completed: "Arbejde udført", verified: "Kontrolleret", closed: "Afsluttet" };

export function canCreateCorrections(roles?: string[]) {
  return roles?.some((role) => ["admin", "board_member", "map_manager"].includes(role)) ?? false;
}

export function canEditCorrections(roles?: string[]) {
  return roles?.some((role) => ["admin", "map_manager"].includes(role)) ?? false;
}
