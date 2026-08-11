import { activityTypeLabels } from "./incidents";

export type HistoryCategory = "break" | "shutdown" | "excavation" | "other_incident";
export type HistorySource = "incident" | "planned_shutdown";

export interface HistoryFilters {
  from?: string;
  to?: string;
  category?: HistoryCategory[];
  location?: string;
  page?: number;
  page_size?: number;
}

export interface HistoryItem {
  id: string;
  source: HistorySource;
  category: HistoryCategory;
  activity_type: HistoryCategory;
  number: string;
  title: string;
  status: string;
  occurred_at: string;
  expected_end_at: string | null;
  locations: string[];
  affected_address_count: number | null;
  href: string;
}

export interface HistoryResponse {
  items: HistoryItem[];
  summary: { total: number; breaks: number; shutdowns: number; excavations: number; other_incidents: number };
  page: number;
  page_size: number;
  total_pages: number;
}

export const historyCategoryLabels: Record<HistoryCategory, string> = activityTypeLabels;
