import { useState } from "react";
import { Link } from "react-router-dom";
import { PlusIcon } from "../components/Icons";
import { useCurrentUser } from "../hooks/useAuth";
import { usePlannedShutdowns } from "../hooks/usePlannedShutdowns";
import { ShutdownStatusBadge } from "../plannedShutdowns/ShutdownStatusBadge";
import { canMutateShutdowns, shutdownStatusLabels } from "../types/plannedShutdowns";
import type { PlannedShutdownStatus } from "../types/plannedShutdowns";
import { MultiSelectButtonGroup } from "../components/MultiSelectButtonGroup";

const formatDate = (value: string) => new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function PlannedShutdownsPage() {
  const [status, setStatus] = useState<PlannedShutdownStatus[]>([]);
  const { data: user } = useCurrentUser();
  const shutdowns = usePlannedShutdowns(status);
  const canMutate = canMutateShutdowns(user?.roles);

  return <div className="shutdown-page">
    <header className="incident-page-heading"><div><span className="eyebrow">Planlagt arbejde</span><h1>Vandlukninger</h1><p>Planlæg lukninger, afgræns berørte adresser og følg informationen.</p></div>{canMutate && <Link className="primary-button" to="/vandlukninger/ny"><PlusIcon />Opret vandlukning</Link>}</header>
    <section className="incident-filters" aria-label="Filtrér vandlukninger"><MultiSelectButtonGroup label="Status" value={status} onChange={setStatus} options={Object.entries(shutdownStatusLabels).map(([value, label]) => ({ value: value as PlannedShutdownStatus, label }))} /><span className="filter-count">{shutdowns.data ? `${shutdowns.data.length} vandlukninger` : "Indlæser…"}</span></section>
    {shutdowns.isLoading && <div className="incident-state" role="status"><span className="loader" />Indlæser vandlukninger…</div>}
    {shutdowns.isError && <div className="incident-state incident-state--error" role="alert"><strong>Vandlukningerne kunne ikke hentes</strong><button type="button" onClick={() => shutdowns.refetch()}>Prøv igen</button></div>}
    {shutdowns.data?.length === 0 && <div className="incident-state"><strong>Ingen vandlukninger matcher filteret</strong></div>}
    {shutdowns.data && shutdowns.data.length > 0 && <div className="shutdown-list">{shutdowns.data.map((item) => <Link className="shutdown-card" to={`/vandlukninger/${item.id}`} key={item.id}>
      <div className="shutdown-date"><strong>{new Intl.DateTimeFormat("da-DK", { day: "2-digit" }).format(new Date(item.starts_at))}</strong><span>{new Intl.DateTimeFormat("da-DK", { month: "short" }).format(new Date(item.starts_at))}</span></div>
      <div className="shutdown-card__main"><div><ShutdownStatusBadge status={item.status} /><span className="shutdown-number">{item.number}</span></div><h2>{item.title}</h2><p>{formatDate(item.starts_at)}{item.expected_end_at ? ` til ${formatDate(item.expected_end_at)}` : ""}</p></div>
      <div className="shutdown-progress"><span>{item.informed_address_count} af {item.affected_address_count} informeret</span><progress value={item.informed_address_count} max={item.affected_address_count || 1} /></div><span className="row-arrow">→</span>
    </Link>)}</div>}
  </div>;
}
