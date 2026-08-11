import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approvePublicStatus,
  closePublicStatus,
  getPublicFeed,
  getPublicStatus,
  updatePublicStatus,
  withdrawPublicStatus,
  type PublicStatusClosePayload,
  type PublicStatusDraft,
  type PublicStatusSourceType,
} from "../api/publicStatus";

const key = (sourceType: PublicStatusSourceType, sourceId: string) => ["public-status", sourceType, sourceId] as const;

export const usePublicFeed = () => useQuery({
  queryKey: ["public-status", "feed"],
  queryFn: getPublicFeed,
  refetchInterval: 60_000,
});

export const usePublicStatus = (sourceType: PublicStatusSourceType, sourceId: string) =>
  useQuery({ queryKey: key(sourceType, sourceId), queryFn: () => getPublicStatus(sourceType, sourceId), enabled: Boolean(sourceId) });

export function usePublicStatusActions(sourceType: PublicStatusSourceType, sourceId: string) {
  const client = useQueryClient();
  const update = (status: Awaited<ReturnType<typeof getPublicStatus>>) => client.setQueryData(key(sourceType, sourceId), status);
  const refreshRelated = () => {
    client.invalidateQueries({ queryKey: ["public-status", "feed"] });
    if (sourceType === "shutdown") client.invalidateQueries({ queryKey: ["planned-shutdowns"] });
  };
  return {
    save: useMutation({ mutationFn: (draft: PublicStatusDraft) => updatePublicStatus(sourceType, sourceId, draft), onSuccess: update }),
    approve: useMutation({ mutationFn: () => approvePublicStatus(sourceType, sourceId), onSuccess: (status) => { update(status); refreshRelated(); } }),
    close: useMutation({ mutationFn: (payload: PublicStatusClosePayload) => closePublicStatus(sourceType, sourceId, payload), onSuccess: (status) => { update(status); refreshRelated(); } }),
    withdraw: useMutation({ mutationFn: () => withdrawPublicStatus(sourceType, sourceId), onSuccess: (status) => { update(status); refreshRelated(); } }),
  };
}
