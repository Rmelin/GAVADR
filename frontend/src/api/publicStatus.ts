import { apiRequest } from "./client";

export type PublicStatusSourceType = "incident" | "shutdown";
export type PublicStatusState = "draft" | "published" | "closed" | "withdrawn";
export type PublicStatusSeverity = "low" | "medium" | "high" | "critical";

export interface PublicStatusDraft {
  title: string;
  message: string;
  areas: string[];
  start_at: string;
  expected_end_at: string | null;
  severity: PublicStatusSeverity;
}

export interface PublicStatus {
  id: string;
  source_type: PublicStatusSourceType;
  source_id: string;
  status: PublicStatusState;
  draft: PublicStatusDraft;
  approved_payload: PublicStatusDraft | null;
  approved_by_id: string | null;
  approved_at: string | null;
  source_updated: boolean;
  needs_approval: boolean;
  close_message: string | null;
  closed_at: string | null;
  display_until: string | null;
  withdrawn_at: string | null;
  updated_at: string;
}

export interface PublicFeedItem extends PublicStatusDraft {
  source_type: PublicStatusSourceType;
  resolved: boolean;
  active_now: boolean;
  updated_at: string;
}

export interface PublicFeed {
  updated_at: string | null;
  status: "normal_drift" | "planlagt_arbejde" | "driftsforstyrrelse";
  items: PublicFeedItem[];
}

export type PublicStatusClosePayload = { message: string; display_until: string | null };

const publicStatusPath = (sourceType: PublicStatusSourceType, sourceId: string) =>
  `/public-status/${encodeURIComponent(sourceType)}/${encodeURIComponent(sourceId)}`;

export const getPublicStatus = (sourceType: PublicStatusSourceType, sourceId: string) =>
  apiRequest<PublicStatus>(publicStatusPath(sourceType, sourceId));

export const updatePublicStatus = (sourceType: PublicStatusSourceType, sourceId: string, draft: PublicStatusDraft) =>
  apiRequest<PublicStatus>(`${publicStatusPath(sourceType, sourceId)}/draft`, { method: "PUT", body: JSON.stringify(draft) });

export const approvePublicStatus = (sourceType: PublicStatusSourceType, sourceId: string) =>
  apiRequest<PublicStatus>(`${publicStatusPath(sourceType, sourceId)}/approve`, { method: "POST" });

export const closePublicStatus = (sourceType: PublicStatusSourceType, sourceId: string, payload: PublicStatusClosePayload) =>
  apiRequest<PublicStatus>(`${publicStatusPath(sourceType, sourceId)}/close`, { method: "POST", body: JSON.stringify(payload) });

export const withdrawPublicStatus = (sourceType: PublicStatusSourceType, sourceId: string) =>
  apiRequest<PublicStatus>(`${publicStatusPath(sourceType, sourceId)}/withdraw`, { method: "POST" });

export const getPublicFeed = () => apiRequest<PublicFeed>("/public/driftsstatus");
