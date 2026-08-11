import { useQuery } from "@tanstack/react-query";
import { getAuditLogs } from "../api/auditLogs";

export const useAuditLogs = (limit = 5) => useQuery({
  queryKey: ["audit-logs", limit],
  queryFn: () => getAuditLogs(limit),
  refetchInterval: 60_000,
});
