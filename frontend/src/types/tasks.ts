import type { UserOption } from "./incidents";
import type { InquiryPriority } from "./inquiries";

export type TaskStatus = "open" | "in_progress" | "blocked" | "done" | "cancelled";

export interface TaskComment { id: string; message: string; author: UserOption; created_at: string }

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: InquiryPriority;
  status: TaskStatus;
  due_date: string | null;
  assigned_to: UserOption | null;
  incident_id: string | null;
  inquiry_id: string | null;
  correction_id: string | null;
  created_by: UserOption;
  comments: TaskComment[];
  created_at: string;
  updated_at: string;
}

export interface TaskCreatePayload {
  title: string;
  description?: string | null;
  priority?: InquiryPriority;
  status?: TaskStatus;
  due_date?: string | null;
  assigned_to_id?: string | null;
  incident_id?: string | null;
  inquiry_id?: string | null;
  correction_id?: string | null;
}

export type TaskPatchPayload = Pick<Partial<TaskCreatePayload>, "title" | "description" | "priority" | "status" | "due_date" | "assigned_to_id">;

export const taskStatusLabels: Record<TaskStatus, string> = { open: "Åben", in_progress: "I gang", blocked: "Blokeret", done: "Udført", cancelled: "Annulleret" };
export const taskPriorityLabels: Record<InquiryPriority, string> = { low: "Lav", medium: "Mellem", high: "Høj", critical: "Kritisk" };
export function canMutateTasks(roles?: string[]) {
  return roles?.some((role) => ["admin", "board_member", "map_manager"].includes(role)) ?? false;
}
