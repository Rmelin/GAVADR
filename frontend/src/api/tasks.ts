import { apiRequest } from "./client";
import type { Task, TaskCreatePayload, TaskPatchPayload } from "../types/tasks";
import { listParams, type ListFilters } from "./queryParams";

export function getTasks(filters: ListFilters = {}) {
  const params = listParams(filters);
  const query = params.toString();
  return apiRequest<Task[]>(`/tasks${query ? `?${query}` : ""}`);
}
export const getTask = (id: string) => apiRequest<Task>(`/tasks/${id}`);
export const createTask = (payload: TaskCreatePayload) => apiRequest<Task>("/tasks", { method: "POST", body: JSON.stringify(payload) });
export const updateTask = (id: string, payload: TaskPatchPayload) => apiRequest<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const addTaskComment = (id: string, message: string) => apiRequest<Task>(`/tasks/${id}/comments`, { method: "POST", body: JSON.stringify({ message }) });
