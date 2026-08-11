import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addIncidentUpdate, createIncident, getIncident, getIncidents, getUserOptions, updateIncident, uploadIncidentAttachment } from "../api/incidents";

export function useIncidents(status: string[], priority: string) {
  return useQuery({ queryKey: ["incidents", { status, priority }], queryFn: () => getIncidents({ status, priority }) });
}

export function useIncident(id: string) {
  return useQuery({ queryKey: ["incidents", id], queryFn: () => getIncident(id), enabled: Boolean(id) });
}

export function useUserOptions(enabled = true) {
  return useQuery({ queryKey: ["users", "options"], queryFn: getUserOptions, enabled });
}

export function useCreateIncident() {
  const client = useQueryClient();
  return useMutation({ mutationFn: createIncident, onSuccess: () => client.invalidateQueries({ queryKey: ["incidents"] }) });
}

export function useIncidentActions(id: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["incidents"] });
  return {
    update: useMutation({ mutationFn: (payload: Record<string, unknown>) => updateIncident(id, payload), onSuccess: refresh }),
    comment: useMutation({ mutationFn: (payload: { message: string; status?: string }) => addIncidentUpdate(id, payload), onSuccess: refresh }),
    upload: useMutation({ mutationFn: (file: File) => uploadIncidentAttachment(id, file), onSuccess: refresh }),
  };
}
