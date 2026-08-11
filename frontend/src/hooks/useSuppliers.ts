import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupplier, getSupplier, getSuppliers, updateSupplier } from "../api/suppliers";
import type { SupplierPatchPayload } from "../types/suppliers";

export const useSuppliers = () => useQuery({ queryKey: ["suppliers"], queryFn: getSuppliers });
export const useSupplier = (id: string) => useQuery({ queryKey: ["suppliers", id], queryFn: () => getSupplier(id), enabled: Boolean(id) });
export function useCreateSupplier() { const client = useQueryClient(); return useMutation({ mutationFn: createSupplier, onSuccess: () => client.invalidateQueries({ queryKey: ["suppliers"] }) }); }
export function useUpdateSupplier(id: string) { const client = useQueryClient(); return useMutation({ mutationFn: (payload: SupplierPatchPayload) => updateSupplier(id, payload), onSuccess: () => client.invalidateQueries({ queryKey: ["suppliers"] }) }); }
