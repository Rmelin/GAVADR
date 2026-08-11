import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMapCorrection, getMapCorrection, getMapCorrections, transitionMapCorrection, updateMapCorrection, uploadMapCorrectionAttachment } from "../api/mapCorrections";
import { getSupplierOptions } from "../api/suppliers";
import type { CorrectionTransitionPayload, MapCorrectionPatchPayload } from "../types/mapCorrections";
import type { ListFilters } from "../api/queryParams";

export const useMapCorrections = (filters: ListFilters = {}) => useQuery({ queryKey: ["map-corrections", filters], queryFn: () => getMapCorrections(filters) });
export const useMapCorrection = (id: string) => useQuery({ queryKey: ["map-corrections", id], queryFn: () => getMapCorrection(id), enabled: Boolean(id) });
export const useSupplierOptions = (enabled = true) => useQuery({ queryKey: ["suppliers", "options"], queryFn: getSupplierOptions, enabled });
export function useCreateMapCorrection() { const client = useQueryClient(); return useMutation({ mutationFn: createMapCorrection, onSuccess: () => client.invalidateQueries({ queryKey: ["map-corrections"] }) }); }
export function useMapCorrectionActions(id: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["map-corrections"] });
  return {
    update: useMutation({ mutationFn: (payload: MapCorrectionPatchPayload) => updateMapCorrection(id, payload), onSuccess: refresh }),
    transition: useMutation({ mutationFn: (payload: CorrectionTransitionPayload) => transitionMapCorrection(id, payload), onSuccess: refresh }),
    upload: useMutation({ mutationFn: (file: File) => uploadMapCorrectionAttachment(id, file), onSuccess: refresh }),
  };
}
