import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCurrentUser } from "../hooks/useAuth";
import { useIncident, useIncidentActions, useUserOptions } from "../hooks/useIncidents";
import { PriorityBadge, StatusBadge } from "../incidents/IncidentBadge";
import { validateIncidentFile } from "../incidents/fileValidation";
import { activityTypeLabels, allowedStatusTransitions, canMutateIncidents, priorityLabels, statusLabels, typeLabels } from "../types/incidents";
import { shutdownStatusLabels } from "../types/plannedShutdowns";
import { PublicStatusPanel } from "../components/PublicStatusPanel";

function date(value?: string | null, includeTime = true) {
  if (!value) return "Ikke angivet";
  return new Intl.DateTimeFormat("da-DK", includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}

export function IncidentDetailPage() {
  const { incidentId = "" } = useParams();
  const incident = useIncident(incidentId);
  const { data: user } = useCurrentUser();
  const canMutate = canMutateIncidents(user?.roles);
  const users = useUserOptions(canMutate);
  const actions = useIncidentActions(incidentId);
  const [message, setMessage] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [fileError, setFileError] = useState("");

  if (incident.isLoading) return <div className="incident-state" role="status"><span className="loader" />Indlæser hændelsen…</div>;
  if (incident.isError || !incident.data) return <div className="incident-state incident-state--error" role="alert"><strong>Hændelsen kunne ikke hentes</strong><Link to="/haendelser">Tilbage til oversigten</Link></div>;
  const item = incident.data;

  async function patch(field: string, value: string | null) {
    if (["resolved", "closed", "cancelled"].includes(String(value)) && !window.confirm(value === "cancelled" ? "Vil du annullere hændelsen?" : "Vil du afslutte hændelsen?")) return;
    try { await actions.update.mutateAsync({ [field]: value }); } catch { /* Error is shown in the toast. */ }
  }

  async function submitUpdate(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    if (["resolved", "closed", "cancelled"].includes(nextStatus) && !window.confirm(nextStatus === "cancelled" ? "Vil du annullere hændelsen med denne opdatering?" : "Vil du afslutte hændelsen med denne opdatering?")) return;
    try {
      await actions.comment.mutateAsync({ message: message.trim(), ...(nextStatus && { status: nextStatus }) });
      setMessage(""); setNextStatus("");
    } catch { /* Error is shown in the toast. */ }
  }

  async function upload(file?: File) {
    if (!file) return;
    const validation = validateIncidentFile(file);
    setFileError(validation ?? "");
    if (validation) return;
    try { await actions.upload.mutateAsync(file); } catch { /* Error is shown in the toast. */ }
  }

  const mutationError = actions.update.error ?? actions.comment.error ?? actions.upload.error;
  return <div className="incident-detail-page">
    <Link className="back-link" to="/haendelser">← Tilbage til hændelser</Link>
    <header className="incident-detail-header"><div><div className="incident-detail-header__badges"><PriorityBadge priority={item.priority} /><StatusBadge status={item.status} /><span>{item.number}</span></div><h1>{item.title}</h1><p>{activityTypeLabels[item.activity_type] ?? typeLabels[item.type as keyof typeof typeLabels] ?? item.type} · registreret {date(item.registered_at)}</p></div></header>
    <div className="incident-detail-grid"><main>
      <section className="detail-panel"><header><span className="eyebrow">Situationsbillede</span><h2>Beskrivelse</h2></header><p className="incident-description">{item.description}</p>{item.public_text && <div className="public-text"><strong>Offentlig status</strong><p>{item.public_text}</p></div>}</section>
      <PublicStatusPanel sourceType="incident" sourceId={item.id} roles={user?.roles} initialDraft={{ title: item.title, message: item.public_text ?? item.description, areas: [], start_at: item.registered_at, expected_end_at: item.expected_end_at ?? null, severity: item.priority }} />
      <section className="detail-panel"><header><span className="eyebrow">Relationer</span><h2>Tilknyttede vandlukninger</h2></header><div className="relations">{(item.planned_shutdowns ?? []).map((shutdown) => <Link to={`/vandlukninger/${shutdown.id}`} key={shutdown.id}>{shutdown.number} · {shutdown.title}<small>{shutdownStatusLabels[shutdown.status as keyof typeof shutdownStatusLabels] ?? shutdown.status} · {date(shutdown.starts_at)}</small></Link>)}{!item.planned_shutdowns?.length && <p className="empty-copy">Ingen tilknyttede vandlukninger.</p>}</div></section>
      {canMutate && <section className="detail-panel"><header><span className="eyebrow">Ny aktivitet</span><h2>Tilføj opdatering</h2></header><form className="update-form" onSubmit={submitUpdate}><label className="field">Kommentar<textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hvad er nyt siden sidst?" required /></label><div><label className="field">Skift eventuelt status<select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}><option value="">Behold {statusLabels[item.status]}</option>{allowedStatusTransitions[item.status].map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></label><button className="primary-button" disabled={actions.comment.isPending || !message.trim()} type="submit">{actions.comment.isPending ? "Gemmer…" : "Tilføj opdatering"}</button></div></form></section>}
      <section className="detail-panel"><header><span className="eyebrow">Revisionsspor</span><h2>Historik og kommentarer</h2></header><div className="incident-timeline">
        {item.updates.length === 0 && <p className="empty-copy">Der er endnu ingen opdateringer.</p>}
        {item.updates.map((update) => <article key={update.id}><span className="timeline-dot" /><div><div><strong>{update.author.display_name}</strong><time>{date(update.created_at)}</time></div><p>{update.message}</p>{update.status && <StatusBadge status={update.status} />}</div></article>)}
        <article><span className="timeline-dot timeline-dot--created" /><div><div><strong>{item.created_by.display_name}</strong><time>{date(item.registered_at)}</time></div><p>Hændelsen blev registreret.</p></div></article>
      </div></section>
      <section className="detail-panel"><header className="attachment-header"><div><span className="eyebrow">Dokumentation</span><h2>Filer og billeder</h2></div>{canMutate && <label className="upload-button">{actions.upload.isPending ? "Uploader…" : "+ Tilføj fil"}<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={actions.upload.isPending} onChange={(e) => void upload(e.target.files?.[0])} /></label>}</header>
        {fileError && <div className="form-error" role="alert">{fileError}</div>}<div className="attachment-list">{item.attachments.length === 0 && <p className="empty-copy">Ingen filer er vedhæftet.</p>}{item.attachments.map((attachment) => <a href={attachment.download_url} className="attachment-row" key={attachment.id}><span className="attachment-icon">{attachment.mime_type === "application/pdf" ? "PDF" : "IMG"}</span><span><strong>{attachment.original_filename}</strong><small>{`${(attachment.size_bytes / 1024 / 1024).toLocaleString("da-DK", { maximumFractionDigits: 1 })} MiB · `}{date(attachment.created_at)}</small></span><b>Hent ↓</b></a>)}</div>
      </section>
    </main><aside>
      <section className="detail-panel incident-controls"><header><span className="eyebrow">Driftsstatus</span><h2>Styring</h2></header>{canMutate ? <div className="control-fields">
        <label className="field">Status<select value={item.status} disabled={actions.update.isPending || allowedStatusTransitions[item.status].length === 0} onChange={(e) => void patch("status", e.target.value)}><option value={item.status}>{statusLabels[item.status]}</option>{allowedStatusTransitions[item.status].map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></label>
        <label className="field">Prioritet<select value={item.priority} disabled={actions.update.isPending} onChange={(e) => void patch("priority", e.target.value)}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field">Ansvarlig<select value={item.assigned_to?.id ?? ""} disabled={actions.update.isPending} onChange={(e) => void patch("assigned_to_id", e.target.value || null)}><option value="">Ikke tildelt</option>{users.data?.map((option) => <option value={option.id} key={option.id}>{option.display_name}</option>)}</select></label>
      </div> : <div className="reader-note"><strong>Læseadgang</strong><p>Du kan følge hændelsen, men ikke ændre den.</p></div>}</section>
      <section className="detail-panel facts-panel"><header><span className="eyebrow">Nøgletal</span><h2>Detaljer</h2></header><dl><div><dt>Ansvarlig</dt><dd>{item.assigned_to?.display_name ?? "Ikke tildelt"}</dd></div><div><dt>Forventet afslutning</dt><dd>{date(item.expected_end_at)}</dd></div><div><dt>Vand genetableret</dt><dd>{date(item.water_restored_at)}</dd></div><div><dt>Placering</dt><dd>{item.address ? <>{item.address.label}<br />{item.address.postal_code} {item.address.city}</> : <>{item.location.latitude.toFixed(5)}, {item.location.longitude.toFixed(5)}</>}</dd></div><div><dt>Senest ændret</dt><dd>{date(item.updated_at)}</dd></div></dl><Link className="secondary-button" to={`/kort?lng=${item.location.longitude}&lat=${item.location.latitude}`}>Vis på ledningskort</Link></section>
    </aside></div>{mutationError && <div className="mutation-toast" role="alert">{mutationError.message}</div>}
  </div>;
}
