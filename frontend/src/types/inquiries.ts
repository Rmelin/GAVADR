import type { IncidentAttachment, UserOption } from "./incidents";

export type InquiryStatus = "new" | "in_progress" | "waiting" | "resolved" | "closed";
export type InquiryPriority = "low" | "medium" | "high" | "critical";
export type InquiryChannel = "phone" | "email" | "web" | "in_person" | "other";

export interface InquiryUpdate {
  id: string;
  message: string;
  previous_status: InquiryStatus | null;
  status: InquiryStatus | null;
  author: UserOption;
  created_at: string;
}

export interface Inquiry {
  id: string;
  number: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  address_id: string | null;
  address_text: string | null;
  channel: InquiryChannel;
  category: string;
  description: string;
  priority: InquiryPriority;
  status: InquiryStatus;
  assigned_to: UserOption | null;
  follow_up_at: string | null;
  incident_id: string | null;
  notes: string | null;
  created_by: UserOption;
  updates: InquiryUpdate[];
  attachments: IncidentAttachment[];
  created_at: string;
  updated_at: string;
}

export interface InquiryCreatePayload {
  contact_name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  address_id?: string | null;
  address_text?: string | null;
  channel: InquiryChannel;
  category: string;
  description: string;
  priority?: InquiryPriority;
  assigned_to_id?: string | null;
  follow_up_at?: string | null;
  incident_id?: string | null;
  notes?: string | null;
}

export type InquiryPatchPayload = Partial<InquiryCreatePayload> & { status?: InquiryStatus };
export interface InquiryUpdatePayload { message: string; status?: InquiryStatus | null }

export const inquiryStatusLabels: Record<InquiryStatus, string> = { new: "Ny", in_progress: "Under behandling", waiting: "Afventer", resolved: "Løst", closed: "Afsluttet" };
export const inquiryPriorityLabels: Record<InquiryPriority, string> = { low: "Lav", medium: "Mellem", high: "Høj", critical: "Kritisk" };
export const inquiryChannelLabels: Record<InquiryChannel, string> = { phone: "Telefon", email: "E-mail", web: "Webformular", in_person: "Personligt fremmøde", other: "Andet" };
export const inquiryCategoryLabels: Record<string, string> = { billing: "Afregning", water_quality: "Vandkvalitet", pressure: "Tryk og forsyning", map_error: "Kortfejl", connection: "Tilslutning", other: "Andet" };
export const inquiryStatusTransitions: Record<InquiryStatus, InquiryStatus[]> = {
  new: ["in_progress", "waiting", "resolved", "closed"],
  in_progress: ["waiting", "resolved", "closed"],
  waiting: ["in_progress", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: [],
};

export function canMutateInquiries(roles?: string[]) {
  return roles?.some((role) => ["admin", "board_member", "map_manager"].includes(role)) ?? false;
}
