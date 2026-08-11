import { useState } from "react";
import { Link } from "react-router-dom";
import { PlusIcon } from "../components/Icons";
import { WorkBadge, WorkState, formatWorkDate } from "../components/WorkItemUi";
import { useCurrentUser } from "../hooks/useAuth";
import { useTasks } from "../hooks/useTasks";
import { canMutateTasks, taskPriorityLabels, taskStatusLabels, type Task } from "../types/tasks";
import type { TaskStatus } from "../types/tasks";
import { MultiSelectButtonGroup } from "../components/MultiSelectButtonGroup";

function relationLabel(item: Task) {
  if (item.incident_id) return "Tilknyttet hændelse";
  if (item.inquiry_id) return "Tilknyttet henvendelse";
  if (item.correction_id) return "Tilknyttet kortrettelse";
  return "Ingen relation";
}

export function TasksPage() {
  const [status, setStatus] = useState<TaskStatus[]>([]);
  const [priority, setPriority] = useState("");
  const [mine, setMine] = useState(false);
  const { data: user } = useCurrentUser();
  const query = useTasks({ status, priority, ...(mine ? { mine: "true" } : {}) });
  return <div className="work-page">
    <header className="incident-page-heading"><div><span className="eyebrow">Arbejdsplan</span><h1>Opgaver</h1><p>Saml frister, ansvar og relationer i én prioriteret arbejdsflade.</p></div>{canMutateTasks(user?.roles) && <Link className="primary-button" to="/opgaver/ny"><PlusIcon />Opret opgave</Link>}</header>
    <section className="incident-filters"><MultiSelectButtonGroup label="Status" value={status} onChange={setStatus} options={Object.entries(taskStatusLabels).map(([value, label]) => ({ value: value as TaskStatus, label }))} /><label>Prioritet<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Alle prioriteter</option>{Object.entries(taskPriorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="check-filter"><input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} /> Kun mine</label><span className="filter-count">{query.data ? `${query.data.length} opgaver` : "Indlæser…"}</span></section>
    <WorkState loading={query.isLoading} error={query.isError} noun="opgaver" retry={() => void query.refetch()} />
    {query.data && <div className="work-list">{query.data.map((item) => <Link className="work-card" to={`/opgaver/${item.id}`} key={item.id}><div><WorkBadge tone={["critical", "high"].includes(item.priority) ? "red" : "aqua"}>{taskPriorityLabels[item.priority]}</WorkBadge><WorkBadge tone="blue">{taskStatusLabels[item.status]}</WorkBadge></div><h2>{item.title}</h2><p>{relationLabel(item)}</p><footer><span>{item.assigned_to?.display_name ?? "Ikke tildelt"}</span><time>Frist {formatWorkDate(item.due_date)}</time><b>→</b></footer></Link>)}</div>}
  </div>;
}
