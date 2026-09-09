import { useQuery } from "@tanstack/react-query";
import { getActivity, getAuditLogs, getAuditUsers, type ActivityFilters } from "../api/auditLogs";

export const useAuditLogs = (limit = 5, enabled = true) => useQuery({
  queryKey: ["audit-logs", limit],
  queryFn: () => getAuditLogs(limit),
  enabled,
  refetchInterval: 60_000,
});

export const useActivity = (filters: ActivityFilters) => useQuery({
  queryKey: ["audit-activity", filters],
  queryFn: () => getActivity(filters),
});

export const useAuditUsers = () => useQuery({
  queryKey: ["audit-users"],
  queryFn: getAuditUsers,
});
