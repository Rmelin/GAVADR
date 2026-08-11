import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addShutdownAddress, createPlannedShutdown, getPlannedShutdown, getPlannedShutdowns, updateAllShutdownAddresses, updatePlannedShutdown, updateShutdownAddress, updateShutdownIncidents } from "../api/plannedShutdowns";

export function usePlannedShutdowns(status: string[] = []) {
  return useQuery({ queryKey: ["planned-shutdowns", { status }], queryFn: () => getPlannedShutdowns(status) });
}

export function usePlannedShutdown(id: string) {
  return useQuery({ queryKey: ["planned-shutdowns", id], queryFn: () => getPlannedShutdown(id), enabled: Boolean(id) });
}

export function useCreatePlannedShutdown() {
  const client = useQueryClient();
  return useMutation({ mutationFn: createPlannedShutdown, onSuccess: () => client.invalidateQueries({ queryKey: ["planned-shutdowns"] }) });
}

export function usePlannedShutdownActions(id: string) {
  const client = useQueryClient();
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["planned-shutdowns"] });
    client.invalidateQueries({ queryKey: ["public-status", "feed"] });
    client.invalidateQueries({ queryKey: ["public-status", "shutdown", id] });
  };
  return {
    update: useMutation({ mutationFn: (payload: Record<string, unknown>) => updatePlannedShutdown(id, payload), onSuccess: refresh }),
    addAddress: useMutation({ mutationFn: (addressId: string) => addShutdownAddress(id, addressId), onSuccess: refresh }),
    address: useMutation({ mutationFn: ({ addressId, ...payload }: { addressId: string; included?: boolean; informed?: boolean }) => updateShutdownAddress(id, addressId, payload), onSuccess: refresh }),
    bulkInformed: useMutation({ mutationFn: (informed: boolean) => updateAllShutdownAddresses(id, informed), onSuccess: refresh }),
    incidents: useMutation({ mutationFn: (incidentIds: string[]) => updateShutdownIncidents(id, incidentIds), onSuccess: refresh }),
  };
}
