import { apiRequest } from "./client";
import type { User, UserCreatePayload, UserUpdatePayload } from "../types/auth";

export const getUsers = () => apiRequest<User[]>("/users");
export const createUser = (payload: UserCreatePayload) => apiRequest<User>("/users", { method: "POST", body: JSON.stringify(payload) });
export const updateUser = (id: string, payload: UserUpdatePayload) => apiRequest<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
