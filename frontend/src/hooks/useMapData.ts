import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClosureScenario, deleteClosureScenario, getAddresses, getClosureAreaRelations, getClosureAreas, getClosureScenarios, getNetworkSummary, getPipes, getValves, searchMap, updateClosureAreaRelations, updateClosureScenario } from "../api/map";
import type { ClosureAreaRelations, ClosureScenarioWrite } from "../types/map";

export function useMapData() {
  const addresses = useQuery({ queryKey: ["map", "addresses"], queryFn: getAddresses });
  const valves = useQuery({ queryKey: ["map", "valves"], queryFn: getValves });
  const pipes = useQuery({ queryKey: ["map", "pipes"], queryFn: getPipes });
  const closureAreas = useQuery({ queryKey: ["map", "closure-areas"], queryFn: getClosureAreas });
  return { addresses, valves, pipes, closureAreas };
}

export const useNetworkSummary = () => useQuery({
  queryKey: ["map", "summary"],
  queryFn: getNetworkSummary,
  refetchInterval: 60_000,
});

export function useClosureAreaRelations(id: string) {
  const client = useQueryClient();
  const key = ["map", "closure-area-relations", id] as const;
  const query = useQuery({ queryKey: key, queryFn: () => getClosureAreaRelations(id), enabled: Boolean(id) });
  const update = useMutation({
    mutationFn: (payload: Pick<ClosureAreaRelations, "address_ids">) => updateClosureAreaRelations(id, payload),
    onSuccess: (relations) => {
      client.setQueryData(key, relations);
      client.invalidateQueries({ queryKey: ["map", "closure-areas"] });
    },
  });
  return { query, update };
}

export function useClosureScenarios(areaId = "") {
  const client = useQueryClient();
  const invalidate = () => {
    client.invalidateQueries({ queryKey: ["map", "closure-scenarios"] });
    client.invalidateQueries({ queryKey: ["map", "closure-areas"] });
    client.invalidateQueries({ queryKey: ["map", "closure-area-relations"] });
  };
  const query = useQuery({ queryKey: ["map", "closure-scenarios", areaId], queryFn: () => getClosureScenarios(areaId) });
  const create = useMutation({ mutationFn: createClosureScenario, onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: ClosureScenarioWrite }) => updateClosureScenario(id, payload), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteClosureScenario, onSuccess: invalidate });
  return { query, create, update, remove };
}

export function useMapSearch(query: string) {
  return useQuery({
    queryKey: ["map", "search", query],
    queryFn: () => searchMap(query),
    enabled: query.trim().length >= 2,
  });
}
