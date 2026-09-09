import { apiRequest } from "./client";

export interface AuditLogSummary {
  id: string;
  actor_user_id: string | null;
  actor_name: string;
  action: string;
  object_type: string;
  object_id: string | null;
  object_number: string | null;
  object_title: string | null;
  starts_at: string | null;
  expected_end_at: string | null;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLogSummary[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AuditUserSummary {
  id: string;
  display_name: string;
  is_active: boolean;
  last_login_at: string | null;
}

export interface ActivityFilters {
  from?: string;
  to?: string;
  actor_user_id?: string;
  activity_type?: "all" | "login" | "changes";
  page?: number;
  page_size?: number;
}

export const getAuditLogs = (limit = 5) => apiRequest<AuditLogSummary[]>(`/audit-logs?limit=${limit}`);

export function getActivity(filters: ActivityFilters) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.actor_user_id) params.set("actor_user_id", filters.actor_user_id);
  if (filters.activity_type && filters.activity_type !== "all") params.set("activity_type", filters.activity_type);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.page_size) params.set("page_size", String(filters.page_size));
  const query = params.toString();
  return apiRequest<AuditLogPage>(`/audit-logs/activity${query ? `?${query}` : ""}`);
}

export const getAuditUsers = () => apiRequest<AuditUserSummary[]>("/audit-logs/users");
