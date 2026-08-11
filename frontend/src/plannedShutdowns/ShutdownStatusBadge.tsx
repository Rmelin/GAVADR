import { shutdownStatusLabels, type PlannedShutdownStatus } from "../types/plannedShutdowns";

export function ShutdownStatusBadge({ status }: { status: PlannedShutdownStatus }) {
  return <span className={`shutdown-status shutdown-status--${status}`}>{shutdownStatusLabels[status]}</span>;
}
