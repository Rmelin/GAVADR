import { apiRequest } from "./client";

export interface AuditLogSummary {
  id: string;
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

export const getAuditLogs = (limit = 5) => apiRequest<AuditLogSummary[]>(`/audit-logs?limit=${limit}`);
