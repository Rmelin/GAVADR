import { FormEvent, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import type { PublicStatusDraft, PublicStatusSeverity, PublicStatusSourceType, PublicStatusState } from "../api/publicStatus";
import { usePublicStatus, usePublicStatusActions } from "../hooks/usePublicStatus";
import { useAppSettings } from "../hooks/useAppSettings";

interface PublicStatusPanelProps {
  sourceType: PublicStatusSourceType;
  sourceId: string;
  roles?: string[];
  initialDraft: PublicStatusDraft;
  showSeverity?: boolean;
}

const stateLabels: Record<PublicStatusState, string> = { draft: "Kladde", published: "Live", closed: "Afsluttet", withdrawn: "Trukket tilbage" };
const severityLabels: Record<PublicStatusSeverity, string> = { low: "Lav", medium: "Mellem", high: "Høj", critical: "Kritisk" };
const canManagePublicStatus = (roles?: string[]) => roles?.some((role) => role === "admin" || role === "board_member") ?? false;

const localDateTime = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const isoDateTime = (value: string) => new Date(value).toISOString();
const displayDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeStyle: "short" }).format(new Date(value))
  : "Ikke angivet";

function PublicPreview({ draft, state, organizationName, showSeverity }: { draft: PublicStatusDraft; state: PublicStatusState; organizationName: string; showSeverity: boolean }) {
  return <article className="public-status-preview" aria-label="Præcis offentlig forhåndsvisning">
    <div className="public-status-preview__top"><span>{organizationName}</span>{showSeverity && <span className={`public-status-severity public-status-severity--${draft.severity}`}>{severityLabels[draft.severity]}</span>}</div>
    <p className="public-status-preview__state">{state === "published" ? "Aktuel driftsinformation" : stateLabels[state]}</p>
    <h3>{draft.title || "Ingen overskrift"}</h3>
    <p className="public-status-preview__message">{draft.message || "Ingen offentlig besked."}</p>
    {draft.areas.length > 0 && <div className="public-status-preview__areas"><strong>Berørte områder</strong><span>{draft.areas.join(" · ")}</span></div>}
    <dl><div><dt>Starter</dt><dd>{displayDate(draft.start_at)}</dd></div><div><dt>Forventet afsluttet</dt><dd>{displayDate(draft.expected_end_at)}</dd></div></dl>
  </article>;
}

export function PublicStatusPanel({ sourceType, sourceId, roles, initialDraft, showSeverity = true }: PublicStatusPanelProps) {
  const status = usePublicStatus(sourceType, sourceId);
  const actions = usePublicStatusActions(sourceType, sourceId);
  const { data: appSettings } = useAppSettings();
  const canManage = canManagePublicStatus(roles);
  const isShutdown = sourceType === "shutdown";
  const [draft, setDraft] = useState(initialDraft);
  const [areas, setAreas] = useState(initialDraft.areas.join("\n"));
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closingMessage, setClosingMessage] = useState("");
  const [displayUntil, setDisplayUntil] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  useEffect(() => {
    if (!status.data) return;
    const next = status.data.draft;
    setDraft(next);
    setAreas(next.areas.join("\n"));
  }, [status.data]);

  const state = status.data?.status ?? "draft";
  const preview = { ...draft, areas: areas.split("\n").map((area) => area.trim()).filter(Boolean) };
  const savedDraft = status.data?.draft;
  const hasUnsavedChanges = Boolean(savedDraft && JSON.stringify(preview) !== JSON.stringify(savedDraft));
  const pending = actions.save.isPending || actions.approve.isPending || actions.close.isPending || actions.withdraw.isPending;
  const actionError = actions.save.error ?? actions.approve.error ?? actions.close.error ?? actions.withdraw.error;
  const missing = status.error instanceof ApiError && status.error.status === 404;
  const shutdownStateLabel = state === "published"
    ? preview.expected_end_at && new Date(preview.expected_end_at).getTime() <= Date.now()
      ? "Afsluttet"
      : new Date(preview.start_at).getTime() <= Date.now() ? "I gang" : "Planlagt"
    : stateLabels[state];

  async function save(event: FormEvent) {
    event.preventDefault();
    try { await actions.save.mutateAsync(preview); } catch { /* The mutation error is shown in the panel. */ }
  }

  async function approve() {
    if (!privacyConfirmed) return;
    try {
      if (missing) await actions.save.mutateAsync(preview);
      await actions.approve.mutateAsync();
      setApprovalOpen(false);
      setPrivacyConfirmed(false);
    } catch { /* The mutation error is shown in the panel. */ }
  }

  async function close() {
    if (!closingMessage.trim()) return;
    try { await actions.close.mutateAsync({ message: closingMessage.trim(), display_until: displayUntil ? isoDateTime(displayUntil) : null }); setCloseOpen(false); setClosingMessage(""); setDisplayUntil(""); } catch { /* The mutation error is shown in the panel. */ }
  }

  async function withdraw() {
    try { await actions.withdraw.mutateAsync(); setWithdrawOpen(false); } catch { /* The mutation error is shown in the panel. */ }
  }

  return <section className="detail-panel public-status-panel">
    <header><div><span className="eyebrow">Borgerkommunikation</span><h2>Offentlig driftsstatus</h2></div><div className="public-status-indicators"><span className={`public-status-state public-status-state--${state}`}>{isShutdown ? shutdownStateLabel : stateLabels[state]}</span>{hasUnsavedChanges && <span className="public-status-unsaved">Ikke-gemt kladde</span>}{status.data?.source_updated && <span className="public-status-stale">Kilden er ændret siden godkendelsen</span>}</div></header>
    {status.isLoading && <div className="public-status-loading" role="status"><span className="loader" />Indlæser offentlig status…</div>}
    {status.isError && !missing && <div className="public-status-error" role="alert"><strong>Offentlig status kunne ikke hentes</strong><span>{status.error.message}</span><button type="button" onClick={() => status.refetch()}>Prøv igen</button></div>}
    {missing && !canManage && <div className="reader-note"><strong>Ingen offentlig status</strong><p>Der er endnu ikke oprettet offentlig driftsinformation.</p></div>}
    {!status.isLoading && (status.data || (missing && canManage)) && <div className={`public-status-layout${canManage ? "" : " public-status-layout--reader"}`}>
      {canManage && <form className="public-status-form" onSubmit={save}>
        <label className="field">Overskrift<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field">Offentlig besked<textarea required rows={5} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} /></label>
        <label className="field">Berørte områder <small>Ét område pr. linje</small><textarea rows={3} value={areas} onChange={(event) => setAreas(event.target.value)} /></label>
        <div className="public-status-form__row"><label className="field">Starter<input required type="datetime-local" value={localDateTime(draft.start_at)} onChange={(event) => event.target.value && setDraft({ ...draft, start_at: isoDateTime(event.target.value) })} /></label><label className="field">Forventet afsluttet<input required={isShutdown} type="datetime-local" value={localDateTime(draft.expected_end_at)} onChange={(event) => setDraft({ ...draft, expected_end_at: event.target.value ? isoDateTime(event.target.value) : null })} /></label></div>
        {isShutdown && <div className="shutdown-workflow-note"><strong>Sådan styres vandlukningen</strong><ul><li>Godkendelse gør vandlukningen planlagt og offentlig.</li><li>Ved starttidspunktet skifter den automatisk til I gang.</li><li>Ved forventet afslutning fjernes den automatisk fra /drift.</li><li>Færdig før tid? Ret Forventet afsluttet til det faktiske sluttidspunkt, gem kladden og godkend den nye version.</li></ul></div>}
        {showSeverity && <label className="field">Alvorlighed<select value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value as PublicStatusSeverity })}>{Object.entries(severityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <button className="secondary-button" disabled={pending} type="submit">{actions.save.isPending ? "Gemmer…" : "Gem kladde"}</button>
      </form>}
      <div className="public-status-preview-wrap"><span className="eyebrow">Præcis offentlig forhåndsvisning</span><PublicPreview draft={preview} state={state} organizationName={appSettings.organization_name} showSeverity={showSeverity} /></div>
    </div>}
    {canManage && !status.isLoading && <footer className="public-status-actions">
      {(state === "draft" || (state === "published" && (status.data?.source_updated || status.data?.needs_approval))) && <button className="primary-button" type="button" disabled={pending || (isShutdown && !preview.expected_end_at) || (!missing && (!status.data || hasUnsavedChanges))} title={hasUnsavedChanges ? "Gem kladden før godkendelse" : isShutdown && !preview.expected_end_at ? "Angiv forventet afslutning før godkendelse" : undefined} onClick={() => setApprovalOpen(true)}>{state === "published" ? "Godkend ny version" : "Godkend og offentliggør"}</button>}
      {!isShutdown && state === "published" && <button className="secondary-button" type="button" disabled={pending} onClick={() => setCloseOpen(true)}>Afslut offentlig status</button>}
      {!isShutdown && (state === "draft" || state === "published") && status.data && <button className="public-status-withdraw" type="button" disabled={pending} onClick={() => setWithdrawOpen(true)}>Træk tilbage</button>}
    </footer>}
    {actionError && <div className="public-status-error" role="alert"><strong>Handlingen kunne ikke gennemføres</strong><span>{actionError.message}</span></div>}
    {approvalOpen && <div className="confirmation-backdrop"><div className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="public-approve-title"><span className="eyebrow">Endelig godkendelse</span><h3 id="public-approve-title">Offentliggør denne status?</h3><p>Forhåndsvisningen ovenfor bliver vist offentligt præcis som den står.</p><label className="privacy-confirmation"><input type="checkbox" checked={privacyConfirmed} onChange={(event) => setPrivacyConfirmed(event.target.checked)} />Jeg bekræfter, at teksten ikke indeholder personoplysninger eller intern information.</label><div><button className="secondary-button" type="button" onClick={() => { setApprovalOpen(false); setPrivacyConfirmed(false); }}>Annuller</button><button className="primary-button" type="button" disabled={!privacyConfirmed || pending} onClick={() => void approve()}>{actions.save.isPending ? "Gemmer kladde…" : actions.approve.isPending ? "Offentliggør…" : "Godkend og offentliggør"}</button></div></div></div>}
    {closeOpen && <div className="confirmation-backdrop"><div className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="public-close-title"><span className="eyebrow">Afslutning</span><h3 id="public-close-title">Afslut offentlig status</h3><p>Afslutningsbeskeden bliver sendt med og bekræfter, at driftsforholdet er afsluttet.</p><label className="field">Afslutningsbesked<textarea required rows={3} value={closingMessage} onChange={(event) => setClosingMessage(event.target.value)} /></label><label className="field">Vis til <small>Valgfrit</small><input type="datetime-local" value={displayUntil} onChange={(event) => setDisplayUntil(event.target.value)} /></label><div><button className="secondary-button" type="button" onClick={() => setCloseOpen(false)}>Annuller</button><button className="primary-button" type="button" disabled={!closingMessage.trim() || actions.close.isPending} onClick={() => void close()}>{actions.close.isPending ? "Afslutter…" : "Bekræft afslutning"}</button></div></div></div>}
    {withdrawOpen && <div className="confirmation-backdrop"><div className="confirmation-dialog confirmation-dialog--danger" role="dialog" aria-modal="true" aria-labelledby="public-withdraw-title"><span className="eyebrow">Tilbagetrækning</span><h3 id="public-withdraw-title">Træk status tilbage?</h3><p>Status fjernes fra den offentlige visning. Brug afslutning i stedet, hvis driftsforholdet er løst.</p><div><button className="secondary-button" type="button" onClick={() => setWithdrawOpen(false)}>Annuller</button><button className="public-status-withdraw" type="button" disabled={actions.withdraw.isPending} onClick={() => void withdraw()}>{actions.withdraw.isPending ? "Trækker tilbage…" : "Ja, træk tilbage"}</button></div></div></div>}
  </section>;
}
