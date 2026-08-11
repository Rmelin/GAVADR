import { apiRequest } from "./client";
import type { Inquiry, InquiryCreatePayload, InquiryPatchPayload, InquiryUpdatePayload } from "../types/inquiries";
import { listParams, type ListFilters } from "./queryParams";

export function getInquiries(filters: ListFilters = {}) {
  const params = listParams(filters);
  const query = params.toString();
  return apiRequest<Inquiry[]>(`/inquiries${query ? `?${query}` : ""}`);
}
export const getInquiry = (id: string) => apiRequest<Inquiry>(`/inquiries/${id}`);
export const createInquiry = (payload: InquiryCreatePayload) => apiRequest<Inquiry>("/inquiries", { method: "POST", body: JSON.stringify(payload) });
export const updateInquiry = (id: string, payload: InquiryPatchPayload) => apiRequest<Inquiry>(`/inquiries/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const addInquiryUpdate = (id: string, payload: InquiryUpdatePayload) => apiRequest<Inquiry>(`/inquiries/${id}/updates`, { method: "POST", body: JSON.stringify(payload) });
export function uploadInquiryAttachment(id: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<Inquiry>(`/inquiries/${id}/attachments`, { method: "POST", body });
}
