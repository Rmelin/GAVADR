import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addTaskComment, createTask, getTask, getTasks, updateTask } from "../api/tasks";
import type { TaskPatchPayload } from "../types/tasks";
import type { ListFilters } from "../api/queryParams";

export const useTasks = (filters: ListFilters = {}) => useQuery({ queryKey: ["tasks", filters], queryFn: () => getTasks(filters) });
export const useTask = (id: string) => useQuery({ queryKey: ["tasks", id], queryFn: () => getTask(id), enabled: Boolean(id) });
export function useCreateTask() { const client = useQueryClient(); return useMutation({ mutationFn: createTask, onSuccess: () => client.invalidateQueries({ queryKey: ["tasks"] }) }); }
export function useTaskActions(id: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["tasks"] });
  return {
    update: useMutation({ mutationFn: (payload: TaskPatchPayload) => updateTask(id, payload), onSuccess: refresh }),
    comment: useMutation({ mutationFn: (message: string) => addTaskComment(id, message), onSuccess: refresh }),
  };
}
