import { useState } from "react";
import { Link } from "react-router-dom";
import { PlusIcon } from "../components/Icons";
import { WorkBadge, WorkState, formatWorkDate } from "../components/WorkItemUi";
import { useCurrentUser } from "../hooks/useAuth";
import { useInquiries } from "../hooks/useInquiries";
import { canMutateInquiries, inquiryCategoryLabels, inquiryPriorityLabels, inquiryStatusLabels } from "../types/inquiries";
import type { InquiryStatus } from "../types/inquiries";
import { MultiSelectButtonGroup } from "../components/MultiSelectButtonGroup";

export function InquiriesPage() {
  const [status, setStatus] = useState<InquiryStatus[]>([]);
  const [priority, setPriority] = useState("");
  const { data: user } = useCurrentUser();
  const query = useInquiries({ status, priority });

  return <div className="work-page">
    <header className="incident-page-heading"><div><span className="eyebrow">Borgerservice</span><h1>Henvendelser</h1><p>Følg kontakt, aftaler og opfølgning fra første svar til afslutning.</p></div>{canMutateInquiries(user?.roles) && <Link className="primary-button" to="/henvendelser/ny"><PlusIcon />Registrer henvendelse</Link>}</header>
    <section className="incident-filters" aria-label="Filtrér henvendelser">
      <MultiSelectButtonGroup label="Status" value={status} onChange={setStatus} options={Object.entries(inquiryStatusLabels).map(([value, label]) => ({ value: value as InquiryStatus, label }))} />
      <label>Prioritet<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Alle prioriteter</option>{Object.entries(inquiryPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <span className="filter-count">{query.data ? `${query.data.length} henvendelser` : "Indlæser…"}</span>
    </section>
    <WorkState loading={query.isLoading} error={query.isError} noun="henvendelser" retry={() => void query.refetch()} />
    {query.data && <div className="work-list">{query.data.map((item) => <Link className="work-card" to={`/henvendelser/${item.id}`} key={item.id}>
      <div><WorkBadge tone={["critical", "high"].includes(item.priority) ? "red" : "amber"}>{inquiryPriorityLabels[item.priority]}</WorkBadge><WorkBadge>{inquiryStatusLabels[item.status]}</WorkBadge></div>
      <h2>{inquiryCategoryLabels[item.category] ?? item.category}</h2>
      <p>{item.contact_name}{item.address_text ? ` · ${item.address_text}` : ""}</p>
      <footer><span>{item.number}</span><span>{item.assigned_to?.display_name ?? "Ikke tildelt"}</span><time>{formatWorkDate(item.follow_up_at ?? item.created_at)}</time><b>→</b></footer>
    </Link>)}</div>}
  </div>;
}
