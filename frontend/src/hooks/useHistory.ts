import { useQuery } from "@tanstack/react-query";
import { getHistory } from "../api/history";
import type { HistoryFilters } from "../types/history";

export const useHistory = (filters: HistoryFilters) => useQuery({
  queryKey: ["history", filters],
  queryFn: () => getHistory(filters),
});
