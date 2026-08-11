import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { WorkBadge, formatWorkDate } from "../components/WorkItemUi";
import { useCurrentUser } from "../hooks/useAuth";
import { useUserOptions } from "../hooks/useIncidents";
import { useTask, useTaskActions } from "../hooks/useTasks";
import { canMutateTasks, taskPriorityLabels, taskStatusLabels, type TaskPatchPayload, type TaskStatus } from "../types/tasks";
import type { InquiryPriority } from "../types/inquiries";

export function TaskDetailPage() {
  const { taskId = "" } = useParams();
  const query = useTask(taskId);
  const { data: user } = useCurrentUser();
  const allowed = canMutateTasks(user?.roles);
  const users = useUserOptions(allowed);
  const actions = useTaskActions(taskId);
  const [comment, setComment] = useState("");
  if (query.isLoading) return <div className="incident-state">Indlæser opgaven…</div>;
  if (!query.data) return <div className="incident-state incident-state--error">Opgaven kunne ikke hentes</div>;
  const item = query.data;

  async function patch(payload: TaskPatchPayload) {
    if (payload.status && ["done", "cancelled"].includes(payload.status) && !window.confirm("Vil du afslutte opgaven?")) return;
    try { await actions.update.mutateAsync(payload); } catch { /* Error is shown below. */ }
  }
  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    try { await actions.comment.mutateAsync(comment.trim()); setComment(""); } catch { /* Error is shown below. */ }
  }
  const error = actions.update.error ?? actions.comment.error;

  const relations = [
    item.incident_id && { label: "Hændelse", path: `/haendelser/${item.incident_id}` },
    item.inquiry_id && { label: "Henvendelse", path: `/henvendelser/${item.inquiry_id}` },
    item.correction_id && { label: "Kortrettelse", path: `/kortrettelser/${item.correction_id}` },
  ].filter((relation): relation is { label: string; path: string } => Boolean(relation));

  return <div className="work-page">
    <Link className="back-link" to="/opgaver">← Tilbage til opgaver</Link>
    <header className="incident-detail-header"><div className="badge-row"><WorkBadge tone={["critical", "high"].includes(item.priority) ? "red" : "amber"}>{taskPriorityLabels[item.priority]}</WorkBadge><WorkBadge>{taskStatusLabels[item.status]}</WorkBadge></div><h1>{item.title}</h1><p>Frist {formatWorkDate(item.due_date)}</p></header>
    <div className="work-detail-grid"><main>
      <section className="detail-panel"><header><span className="eyebrow">Opgave</span><h2>Beskrivelse</h2></header><p className="incident-description">{item.description || "Ingen beskrivelse."}</p></section>
      <section className="detail-panel"><header><span className="eyebrow">Samarbejde</span><h2>Kommentarer</h2></header>{allowed && <form className="inline-comment" onSubmit={addComment}><label className="field">Ny kommentar<textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} /></label><button className="primary-button" disabled={!comment.trim() || actions.comment.isPending}>Tilføj kommentar</button></form>}<div className="incident-timeline">{item.comments.map((entry) => <article key={entry.id}><span className="timeline-dot" /><div><div><strong>{entry.author.display_name}</strong><time>{formatWorkDate(entry.created_at)}</time></div><p>{entry.message}</p></div></article>)}{!item.comments.length && <p className="empty-copy">Ingen kommentarer endnu.</p>}</div></section>
    </main><aside>
      <section className="detail-panel"><header><span className="eyebrow">Styring</span><h2>Status og ansvar</h2></header>{allowed ? <div className="control-fields">
        <label className="field">Status<select value={item.status} onChange={(event) => void patch({ status: event.target.value as TaskStatus })}>{Object.entries(taskStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field">Prioritet<select value={item.priority} onChange={(event) => void patch({ priority: event.target.value as InquiryPriority })}>{Object.entries(taskPriorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field">Ansvarlig<select value={item.assigned_to?.id ?? ""} onChange={(event) => void patch({ assigned_to_id: event.target.value || null })}><option value="">Ikke tildelt</option>{users.data?.map((option) => <option value={option.id} key={option.id}>{option.display_name}</option>)}</select></label>
        <label className="field">Frist<input type="date" defaultValue={item.due_date ?? ""} onBlur={(event) => void patch({ due_date: event.target.value || null })} /></label>
      </div> : <div className="reader-note">Du har læseadgang.</div>}</section>
      <section className="detail-panel"><header><span className="eyebrow">Relation</span><h2>Tilknyttet sag</h2></header><div className="relations">{relations.map((relation) => <Link to={relation.path} key={relation.path}>{relation.label}<small>Åbn sag</small></Link>)}{!relations.length && <p className="empty-copy">Ingen relation.</p>}</div></section>
    </aside></div>
    {error && <div className="mutation-toast" role="alert">{error.message}</div>}
  </div>;
}
