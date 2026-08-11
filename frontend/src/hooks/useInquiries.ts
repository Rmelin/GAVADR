import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addInquiryUpdate, createInquiry, getInquiries, getInquiry, updateInquiry, uploadInquiryAttachment } from "../api/inquiries";
import type { InquiryPatchPayload, InquiryUpdatePayload } from "../types/inquiries";
import type { ListFilters } from "../api/queryParams";

export const useInquiries = (filters: ListFilters = {}) => useQuery({ queryKey: ["inquiries", filters], queryFn: () => getInquiries(filters) });
export const useInquiry = (id: string) => useQuery({ queryKey: ["inquiries", id], queryFn: () => getInquiry(id), enabled: Boolean(id) });
export function useCreateInquiry() { const client = useQueryClient(); return useMutation({ mutationFn: createInquiry, onSuccess: () => client.invalidateQueries({ queryKey: ["inquiries"] }) }); }
export function useInquiryActions(id: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["inquiries"] });
  return {
    update: useMutation({ mutationFn: (payload: InquiryPatchPayload) => updateInquiry(id, payload), onSuccess: refresh }),
    addUpdate: useMutation({ mutationFn: (payload: InquiryUpdatePayload) => addInquiryUpdate(id, payload), onSuccess: refresh }),
    upload: useMutation({ mutationFn: (file: File) => uploadInquiryAttachment(id, file), onSuccess: refresh }),
  };
}
