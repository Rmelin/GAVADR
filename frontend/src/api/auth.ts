import { apiRequest } from "./client";
import type { LoginCredentials, User } from "../types/auth";

export async function login(credentials: LoginCredentials): Promise<User> {
  await apiRequest<{ access_token: string; token_type: string; expires_in: number }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  return getCurrentUser();
}

export async function getCurrentUser(): Promise<User> {
  return apiRequest<User>("/auth/me");
}

export function logout(): Promise<void> {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}
