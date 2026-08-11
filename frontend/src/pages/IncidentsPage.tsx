import { Link } from "react-router-dom";
import { PlusIcon } from "../components/Icons";
import { useCurrentUser } from "../hooks/useAuth";
import { useIncidents } from "../hooks/useIncidents";
import { PriorityBadge, StatusBadge } from "../incidents/IncidentBadge";
import { canMutateIncidents, priorityLabels, statusLabels, typeLabels } from "../types/incidents";
import { useState } from "react";
import { MultiSelectButtonGroup } from "../components/MultiSelectButtonGroup";
import type { IncidentStatus } from "../types/incidents";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function IncidentsPage() {
  const [status, setStatus] = useState<IncidentStatus[]>(["new", "assessing", "active", "monitoring"]);
  const [priority, setPriority] = useState("");
  const { data: user } = useCurrentUser();
  const incidents = useIncidents(status, priority);
  const canMutate = canMutateIncidents(user?.roles);

  return <div className="incidents-page">
    <header className="incident-page-heading"><div><span className="eyebrow">Drift og beredskab</span><h1>Hændelser</h1><p>Følg aktive driftsforstyrrelser fra registrering til afslutning.</p></div>{canMutate && <Link className="primary-button" to="/haendelser/ny"><PlusIcon />Registrer hændelse</Link>}</header>
    <section className="incident-filters" aria-label="Filtrér hændelser">
      <MultiSelectButtonGroup label="Status" value={status} onChange={setStatus} options={Object.entries(statusLabels).map(([value, label]) => ({ value: value as IncidentStatus, label }))} />
      <label>Prioritet<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Alle prioriteter</option>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <span className="filter-count">{incidents.data ? `${incidents.data.length} hændelser` : "Indlæser…"}</span>
    </section>
    {incidents.isLoading && <div className="incident-state" role="status"><span className="loader" />Indlæser hændelser…</div>}
    {incidents.isError && <div className="incident-state incident-state--error" role="alert"><strong>Hændelserne kunne ikke hentes</strong><button type="button" onClick={() => incidents.refetch()}>Prøv igen</button></div>}
    {incidents.data?.length === 0 && <div className="incident-state"><strong>Ingen hændelser matcher filtrene</strong><span>Prøv en anden status eller prioritet.</span></div>}
    {incidents.data && incidents.data.length > 0 && <div className="incident-cards">
      {incidents.data.map((incident) => <Link className="incident-card" to={`/haendelser/${incident.id}`} key={incident.id}>
        <div className="incident-card__top"><PriorityBadge priority={incident.priority} /><StatusBadge status={incident.status} /><time>{formatDate(incident.registered_at)}</time></div>
        <h2>{incident.title}</h2><p>{typeLabels[incident.type] ?? incident.type}</p>
        <div className="incident-card__footer"><span><small>Nummer</small><strong>{incident.number}</strong></span><span><small>Ansvarlig</small><strong>{incident.assigned_to?.display_name ?? "Ikke tildelt"}</strong></span><span className="incident-card__arrow" aria-hidden="true">→</span></div>
      </Link>)}
    </div>}
  </div>;
}
