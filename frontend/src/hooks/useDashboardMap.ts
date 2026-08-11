import { useQuery } from "@tanstack/react-query";
import { getDashboardMap } from "../api/dashboard";

export const useDashboardMap = () => useQuery({
  queryKey: ["dashboard", "map"],
  queryFn: getDashboardMap,
  refetchInterval: 60_000,
});
