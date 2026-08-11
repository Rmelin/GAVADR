export interface SupplierOption { id: string; name: string }

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierCreatePayload {
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  active?: boolean;
}

export type SupplierPatchPayload = Partial<SupplierCreatePayload>;
