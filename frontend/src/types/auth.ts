export type Role = "admin" | "board_member" | "map_manager" | "reader";

export interface User {
  id: string;
  email: string;
  display_name: string;
  roles: Role[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginCredentials { email: string; password: string }

export interface UserCreatePayload {
  email: string;
  display_name: string;
  password: string;
  roles: Role[];
}

export interface UserUpdatePayload {
  display_name?: string;
  is_active?: boolean;
  roles?: Role[];
  password?: string;
}

export const roles: Role[] = ["admin", "board_member", "map_manager", "reader"];

export const roleLabels: Record<Role, string> = {
  admin: "Administrator",
  board_member: "Bestyrelsesmedlem",
  map_manager: "Kortansvarlig",
  reader: "Læsebruger",
};

export function roleLabel(role: Role): string { return roleLabels[role]; }
export function primaryRole(user: User | null | undefined): Role { return user?.roles[0] ?? "reader"; }
