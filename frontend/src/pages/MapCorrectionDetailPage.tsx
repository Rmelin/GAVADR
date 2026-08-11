import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { WorkBadge, formatWorkDate } from "../components/WorkItemUi";
import { useCurrentUser } from "../hooks/useAuth";
import { useUserOptions } from "../hooks/useIncidents";
import { useMapCorrection, useMapCorrectionActions, useSupplierOptions } from "../hooks/useMapCorrections";
import { validateIncidentFile } from "../incidents/fileValidation";
import { inquiryPriorityLabels, type InquiryPriority } from "../types/inquiries";
import { canEditCorrections, correctionStatusLabels, correctionStatuses } from "../types/mapCorrections";

export function MapCorrectionDetailPage() {
  const { correctionId = "" } = useParams();
  const query = useMapCorrection(correctionId);
  const { data: user } = useCurrentUser();
  const allowed = canEditCorrections(user?.roles);
  const users = useUserOptions(allowed);
  const suppliers = useSupplierOptions(allowed);
  const actions = useMapCorrectionActions(correctionId);
  const [note, setNote] = useState("");
  const [fileError, setFileError] = useState("");
  if (query.isLoading) return <div className="incident-state">Indlæser kortrettelsen…</div>;
  if (!query.data) return <div className="incident-state incident-state--error">Kortrettelsen kunne ikke hentes</div>;
  const item = query.data;
  const index = correctionStatuses.indexOf(item.status);
  const nextStatus = correctionStatuses[index + 1];

  async function patch(payload: Parameters<typeof actions.update.mutateAsync>[0]) {
    try { await actions.update.mutateAsync(payload); } catch { /* Error is shown below. */ }
  }
  async function transition(event: FormEvent) {
    event.preventDefault();
    if (!nextStatus) return;
    if (["verified", "closed"].includes(nextStatus) && !window.confirm(nextStatus === "verified" ? "Bekræft, at arbejdet er kontrolleret?" : "Afslut kortrettelsen endeligt?")) return;
    try {
      await actions.transition.mutateAsync({ status: nextStatus, note: note.trim() || null });
      setNote("");
    } catch { /* Error is shown below. */ }
  }
  async function upload(file?: File) {
    if (!file) return;
    const validation = validateIncidentFile(file);
    setFileError(validation ?? "");
    if (validation) return;
    try { await actions.upload.mutateAsync(file); } catch { /* Error is shown below. */ }
  }
  const error = actions.update.error ?? actions.transition.error ?? actions.upload.error;

  return <div className="work-page">
    <Link className="back-link" to="/kortrettelser">← Tilbage til kortrettelser</Link>
    <header className="incident-detail-header"><div className="badge-row"><WorkBadge tone="amber">{correctionStatusLabels[item.status]}</WorkBadge><WorkBadge>{inquiryPriorityLabels[item.priority]}</WorkBadge><span>{item.number}</span></div><h1>{item.title}</h1><p>{item.category} · senest opdateret {formatWorkDate(item.updated_at)}</p></header>
    <ol className="workflow" aria-label="Kortrettelsens arbejdsgang">{correctionStatuses.map((status, position) => <li className={position <= index ? "is-complete" : ""} aria-current={status === item.status ? "step" : undefined} key={status}><span>{position + 1}</span>{correctionStatusLabels[status]}</li>)}</ol>
    <div className="work-detail-grid"><main>
      <section className="detail-panel"><header><span className="eyebrow">Grundlag</span><h2>Beskrivelse</h2></header><p className="incident-description">{item.description}</p></section>
      {allowed && <section className="detail-panel"><header><span className="eyebrow">Ressourcer</span><h2>Tildeling og leverandør</h2></header><div className="control-fields">
        <label className="field">Ansvarlig<select value={item.assigned_to?.id ?? ""} onChange={(event) => void patch({ assigned_to_id: event.target.value || null })}><option value="">Ikke tildelt</option>{users.data?.map((option) => <option value={option.id} key={option.id}>{option.display_name}</option>)}</select></label>
        <label className="field">Leverandør<select value={item.supplier?.id ?? ""} onChange={(event) => void patch({ supplier_id: event.target.value || null })}><option value="">Ikke valgt</option>{suppliers.data?.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
        <label className="field">Leverandørreference<input defaultValue={item.supplier_reference ?? ""} onBlur={(event) => void patch({ supplier_reference: event.target.value || null })} /></label>
        <label className="field">Leverandørfrist<input type="datetime-local" defaultValue={item.supplier_due_at?.slice(0, 16) ?? ""} onBlur={(event) => void patch({ supplier_due_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
        <label className="field">Prioritet<select value={item.priority} onChange={(event) => void patch({ priority: event.target.value as InquiryPriority })}>{Object.entries(inquiryPriorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </div></section>}
      <section className="detail-panel"><header><span className="eyebrow">Revisionsspor</span><h2>Historik</h2></header><div className="incident-timeline">
        {item.history.map((entry) => <article key={entry.id}><span className="timeline-dot" /><div><div><strong>{entry.author.display_name}</strong><time>{formatWorkDate(entry.created_at)}</time></div><p>{entry.previous_status ? `${correctionStatusLabels[entry.previous_status]} → ${correctionStatusLabels[entry.status]}` : correctionStatusLabels[entry.status]}</p>{entry.note && <p>{entry.note}</p>}</div></article>)}
        {!item.history.length && <p className="empty-copy">Ingen historik endnu.</p>}
      </div></section>
      <section className="detail-panel"><header className="attachment-header"><div><span className="eyebrow">Dokumentation</span><h2>Filer og billeder</h2></div>{allowed && <label className="upload-button">{actions.upload.isPending ? "Uploader…" : "+ Tilføj fil"}<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={actions.upload.isPending} onChange={(event) => void upload(event.target.files?.[0])} /></label>}</header>
        {fileError && <div className="form-error" role="alert">{fileError}</div>}<div className="attachment-list">{!item.attachments.length && <p className="empty-copy">Ingen filer er vedhæftet.</p>}{item.attachments.map((attachment) => <a href={attachment.download_url} className="attachment-row" key={attachment.id}><span className="attachment-icon">{attachment.mime_type === "application/pdf" ? "PDF" : "IMG"}</span><span><strong>{attachment.original_filename}</strong><small>{`${(attachment.size_bytes / 1024 / 1024).toLocaleString("da-DK", { maximumFractionDigits: 1 })} MiB · `}{formatWorkDate(attachment.created_at)}</small></span><b>Hent ↓</b></a>)}</div>
      </section>
    </main><aside>
      <section className="detail-panel"><header><span className="eyebrow">Arbejdsgang</span><h2>Næste trin</h2></header>{allowed ? nextStatus ? <form className="control-fields" onSubmit={transition}><p>Flyt til <strong>{correctionStatusLabels[nextStatus]}</strong></p><label className="field">Note til overgangen<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label><button className="primary-button" disabled={actions.transition.isPending}>Flyt til næste trin</button></form> : <p>Kortrettelsen er afsluttet.</p> : <div className="reader-note">Du har læseadgang.</div>}</section>
      <section className="detail-panel"><header><span className="eyebrow">Placering</span><h2>Koordinater</h2></header><dl className="work-facts"><div><dt>Breddegrad</dt><dd>{item.location.latitude}</dd></div><div><dt>Længdegrad</dt><dd>{item.location.longitude}</dd></div><div><dt>Leverandør</dt><dd>{item.supplier?.name ?? "Ikke valgt"}</dd></div><div><dt>Leverandørfrist</dt><dd>{formatWorkDate(item.supplier_due_at)}</dd></div></dl><Link className="secondary-button panel-link" to={`/kort?lng=${item.location.longitude}&lat=${item.location.latitude}`}>Vis på ledningskort</Link></section>
      {item.inquiry_id && <Link className="relation-link" to={`/henvendelser/${item.inquiry_id}`}>Vis tilknyttet henvendelse →</Link>}
    </aside></div>
    {error && <div className="mutation-toast" role="alert">{error.message}</div>}
  </div>;
}
