import { apiRequest } from "./client";
import type { Supplier, SupplierCreatePayload, SupplierOption, SupplierPatchPayload } from "../types/suppliers";

export const getSupplierOptions = () => apiRequest<SupplierOption[]>("/suppliers/options");
export const getSuppliers = () => apiRequest<Supplier[]>("/suppliers");
export const getSupplier = (id: string) => apiRequest<Supplier>(`/suppliers/${id}`);
export const createSupplier = (payload: SupplierCreatePayload) => apiRequest<Supplier>("/suppliers", { method: "POST", body: JSON.stringify(payload) });
export const updateSupplier = (id: string, payload: SupplierPatchPayload) => apiRequest<Supplier>(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
