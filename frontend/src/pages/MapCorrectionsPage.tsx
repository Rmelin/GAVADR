import { useState } from "react";
import { Link } from "react-router-dom";
import { PlusIcon } from "../components/Icons";
import { WorkBadge, WorkState, formatWorkDate } from "../components/WorkItemUi";
import { useCurrentUser } from "../hooks/useAuth";
import { useMapCorrections } from "../hooks/useMapCorrections";
import { inquiryPriorityLabels } from "../types/inquiries";
import { canCreateCorrections, correctionStatusLabels } from "../types/mapCorrections";
import type { CorrectionStatus } from "../types/mapCorrections";
import { MultiSelectButtonGroup } from "../components/MultiSelectButtonGroup";

export function MapCorrectionsPage() {
  const [status, setStatus] = useState<CorrectionStatus[]>([]);
  const { data: user } = useCurrentUser();
  const query = useMapCorrections({ status });
  return <div className="work-page">
    <header className="incident-page-heading"><div><span className="eyebrow">Kortvedligehold</span><h1>Kortrettelser</h1><p>Styr rettelser sikkert gennem tildeling, leverandørarbejde og kontrol.</p></div>{canCreateCorrections(user?.roles) && <Link className="primary-button" to="/kortrettelser/ny"><PlusIcon />Opret kortrettelse</Link>}</header>
    <section className="incident-filters"><MultiSelectButtonGroup label="Status" value={status} onChange={setStatus} options={Object.entries(correctionStatusLabels).map(([value, label]) => ({ value: value as CorrectionStatus, label }))} /><span className="filter-count">{query.data ? `${query.data.length} rettelser` : "Indlæser…"}</span></section>
    <WorkState loading={query.isLoading} error={query.isError} noun="kortrettelser" retry={() => void query.refetch()} />
    {query.data && <div className="work-list">{query.data.map((item) => <Link className="work-card" to={`/kortrettelser/${item.id}`} key={item.id}><div><WorkBadge tone="amber">{correctionStatusLabels[item.status]}</WorkBadge><WorkBadge>{inquiryPriorityLabels[item.priority]}</WorkBadge></div><h2>{item.title}</h2><p>{item.category} · {item.supplier?.name ?? "Leverandør ikke valgt"}</p><footer><span>{item.number}</span><span>{item.assigned_to?.display_name ?? "Ikke tildelt"}</span><time>{formatWorkDate(item.updated_at)}</time><b>→</b></footer></Link>)}</div>}
  </div>;
}
