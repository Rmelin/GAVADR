import { priorityLabels, statusLabels, type IncidentPriority, type IncidentStatus } from "../types/incidents";

export function PriorityBadge({ priority }: { priority: IncidentPriority }) {
  return <span className={`incident-badge incident-badge--${priority}`}>{priorityLabels[priority] ?? priority}</span>;
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`status-badge status-badge--${status}`}>{statusLabels[status] ?? status}</span>;
}
