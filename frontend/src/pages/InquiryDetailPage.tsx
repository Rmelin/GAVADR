import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { WorkBadge, formatWorkDate } from "../components/WorkItemUi";
import { useCurrentUser } from "../hooks/useAuth";
import { useUserOptions } from "../hooks/useIncidents";
import { useInquiry, useInquiryActions } from "../hooks/useInquiries";
import { validateIncidentFile } from "../incidents/fileValidation";
import { canMutateInquiries, inquiryCategoryLabels, inquiryChannelLabels, inquiryPriorityLabels, inquiryStatusLabels, inquiryStatusTransitions, type InquiryPriority, type InquiryStatus } from "../types/inquiries";

export function InquiryDetailPage() {
  const { inquiryId = "" } = useParams();
  const query = useInquiry(inquiryId);
  const { data: user } = useCurrentUser();
  const allowed = canMutateInquiries(user?.roles);
  const users = useUserOptions(allowed);
  const actions = useInquiryActions(inquiryId);
  const [message, setMessage] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [fileError, setFileError] = useState("");
  if (query.isLoading) return <div className="incident-state">Indlæser henvendelsen…</div>;
  if (!query.data) return <div className="incident-state incident-state--error">Henvendelsen kunne ikke hentes</div>;
  const item = query.data;

  async function patch(payload: Parameters<typeof actions.update.mutateAsync>[0]) {
    try { await actions.update.mutateAsync(payload); } catch { /* Error is shown below. */ }
  }
  async function addUpdate(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    if (["resolved", "closed"].includes(updateStatus) && !window.confirm("Vil du afslutte henvendelsen?")) return;
    try {
      await actions.addUpdate.mutateAsync({ message: message.trim(), status: updateStatus ? updateStatus as InquiryStatus : undefined });
      setMessage("");
      setUpdateStatus("");
    } catch { /* Error is shown below. */ }
  }
  async function upload(file?: File) {
    if (!file) return;
    const validation = validateIncidentFile(file);
    setFileError(validation ?? "");
    if (validation) return;
    try { await actions.upload.mutateAsync(file); } catch { /* Error is shown below. */ }
  }
  const error = actions.update.error ?? actions.addUpdate.error ?? actions.upload.error;

  return <div className="work-page">
    <Link className="back-link" to="/henvendelser">← Tilbage til henvendelser</Link>
    <header className="incident-detail-header"><div className="badge-row"><WorkBadge tone={["critical", "high"].includes(item.priority) ? "red" : "amber"}>{inquiryPriorityLabels[item.priority]}</WorkBadge><WorkBadge>{inquiryStatusLabels[item.status]}</WorkBadge><span>{item.number}</span></div><h1>{inquiryCategoryLabels[item.category] ?? item.category}</h1><p>Registreret {formatWorkDate(item.created_at)} via {inquiryChannelLabels[item.channel]}</p></header>
    <div className="work-detail-grid"><main>
      <section className="detail-panel"><header><span className="eyebrow">Henvendelse</span><h2>Beskrivelse og noter</h2></header><p className="incident-description">{item.description}</p>{item.notes && <div className="public-text"><strong>Interne noter</strong><p>{item.notes}</p></div>}</section>
      {allowed && <section className="detail-panel"><header><span className="eyebrow">Opfølgning</span><h2>Tilføj opdatering</h2></header><form className="update-form" onSubmit={addUpdate}>
        <label className="field">Besked<textarea required rows={4} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        <label className="field">Skift eventuelt status<select value={updateStatus} onChange={(event) => setUpdateStatus(event.target.value)}><option value="">Behold {inquiryStatusLabels[item.status].toLowerCase()}</option>{inquiryStatusTransitions[item.status].map((status) => <option value={status} key={status}>{inquiryStatusLabels[status]}</option>)}</select></label>
        <div><span /><button className="primary-button" disabled={actions.addUpdate.isPending || !message.trim()}>Tilføj opdatering</button></div>
      </form></section>}
      <section className="detail-panel"><header><span className="eyebrow">Revisionsspor</span><h2>Opdateringer</h2></header><div className="incident-timeline">
        {item.updates.map((entry) => <article key={entry.id}><span className="timeline-dot" /><div><div><strong>{entry.author.display_name}</strong><time>{formatWorkDate(entry.created_at)}</time></div><p>{entry.message}</p>{entry.status && <WorkBadge>{inquiryStatusLabels[entry.status]}</WorkBadge>}</div></article>)}
        {!item.updates.length && <p className="empty-copy">Ingen opdateringer endnu.</p>}
      </div></section>
      <section className="detail-panel"><header className="attachment-header"><div><span className="eyebrow">Dokumentation</span><h2>Filer og billeder</h2></div>{allowed && <label className="upload-button">{actions.upload.isPending ? "Uploader…" : "+ Tilføj fil"}<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={actions.upload.isPending} onChange={(event) => void upload(event.target.files?.[0])} /></label>}</header>
        {fileError && <div className="form-error" role="alert">{fileError}</div>}<div className="attachment-list">{!item.attachments.length && <p className="empty-copy">Ingen filer er vedhæftet.</p>}{item.attachments.map((attachment) => <a href={attachment.download_url} className="attachment-row" key={attachment.id}><span className="attachment-icon">{attachment.mime_type === "application/pdf" ? "PDF" : "IMG"}</span><span><strong>{attachment.original_filename}</strong><small>{`${(attachment.size_bytes / 1024 / 1024).toLocaleString("da-DK", { maximumFractionDigits: 1 })} MiB · `}{formatWorkDate(attachment.created_at)}</small></span><b>Hent ↓</b></a>)}</div>
      </section>
    </main><aside>
      <section className="detail-panel"><header><span className="eyebrow">Kontakt</span><h2>{item.contact_name}</h2></header><dl className="work-facts"><div><dt>Adresse</dt><dd>{item.address_text || "Ikke angivet"}</dd></div><div><dt>Telefon</dt><dd>{item.contact_phone || "Ikke angivet"}</dd></div><div><dt>E-mail</dt><dd>{item.contact_email || "Ikke angivet"}</dd></div><div><dt>Kategori</dt><dd>{inquiryCategoryLabels[item.category] ?? item.category}</dd></div></dl></section>
      <section className="detail-panel"><header><span className="eyebrow">Sagsstyring</span><h2>Prioritet og ansvar</h2></header>{allowed ? <div className="control-fields">
        <label className="field">Prioritet<select value={item.priority} onChange={(event) => void patch({ priority: event.target.value as InquiryPriority })}>{Object.entries(inquiryPriorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field">Ansvarlig<select value={item.assigned_to?.id ?? ""} onChange={(event) => void patch({ assigned_to_id: event.target.value || null })}><option value="">Ikke tildelt</option>{users.data?.map((option) => <option value={option.id} key={option.id}>{option.display_name}</option>)}</select></label>
        <label className="field">Følg op<input type="datetime-local" defaultValue={item.follow_up_at?.slice(0, 16) ?? ""} onBlur={(event) => void patch({ follow_up_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
        <Link className="primary-button" to={`/kortrettelser/ny?inquiry_id=${item.id}`}>Opret tilknyttet kortrettelse</Link>
      </div> : <div className="reader-note">Du har læseadgang.</div>}</section>
      {item.incident_id && <Link className="relation-link" to={`/haendelser/${item.incident_id}`}>Vis tilknyttet hændelse →</Link>}
    </aside></div>
    {error && <div className="mutation-toast" role="alert">{error.message}</div>}
  </div>;
}
