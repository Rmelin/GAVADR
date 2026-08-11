import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { shutdownCsvUrl } from "../api/plannedShutdowns";
import { useCurrentUser } from "../hooks/useAuth";
import { useMapSearch } from "../hooks/useMapData";
import { usePlannedShutdown, usePlannedShutdownActions } from "../hooks/usePlannedShutdowns";
import { ShutdownStatusBadge } from "../plannedShutdowns/ShutdownStatusBadge";
import { canMutateShutdowns } from "../types/plannedShutdowns";
import { PublicStatusPanel } from "../components/PublicStatusPanel";
import { useIncidents } from "../hooks/useIncidents";
import { activityTypeLabels, statusLabels } from "../types/incidents";
import type { CompactIncident } from "../types/plannedShutdowns";

const date = (value: string) => new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
const addressLabel = (address: { street_name?: string; house_number?: string; postal_code?: string; city?: string }) => `${address.street_name ?? ""} ${address.house_number ?? ""}, ${address.postal_code ?? ""} ${address.city ?? ""}`.replace(/\s+/g, " ").trim();

function IncidentRelations({ linked, save, pending }: { linked: CompactIncident[]; save: (ids: string[]) => Promise<unknown>; pending: boolean }) {
  const incidents = useIncidents([], "");
  const [selected, setSelected] = useState(() => linked.map((item) => item.id));
  return <div className="linked-incident-editor"><fieldset className="incident-relation-picker"><legend className="sr-only">Tilknyttede hændelser</legend>{Array.isArray(incidents.data) && incidents.data.map((incident) => <label key={incident.id}><input type="checkbox" checked={selected.includes(incident.id)} disabled={pending} onChange={(event) => setSelected((current) => event.target.checked ? [...current, incident.id] : current.filter((id) => id !== incident.id))} /><span><strong>{incident.number} · {incident.title}</strong><small>{statusLabels[incident.status]}</small></span></label>)}</fieldset><button className="secondary-button" type="button" disabled={pending} onClick={() => void save(selected)}>{pending ? "Gemmer…" : "Gem tilknytninger"}</button></div>;
}
export function PlannedShutdownDetailPage() {
  const { shutdownId = "" } = useParams();
  const shutdown = usePlannedShutdown(shutdownId);
  const actions = usePlannedShutdownActions(shutdownId);
  const { data: user } = useCurrentUser();
  const canMutate = canMutateShutdowns(user?.roles);
  const [query, setQuery] = useState("");
  const search = useMapSearch(query);
  if (shutdown.isLoading) return <div className="incident-state" role="status"><span className="loader" />Indlæser vandlukningen…</div>;
  if (shutdown.isError || !shutdown.data) return <div className="incident-state incident-state--error" role="alert"><strong>Vandlukningen kunne ikke hentes</strong><Link to="/vandlukninger">Tilbage til oversigten</Link></div>;
  const item = shutdown.data;
  const included = item.addresses.filter((address) => address.included);
  const pending = actions.update.isPending || actions.addAddress.isPending || actions.address.isPending || actions.bulkInformed.isPending || actions.incidents.isPending;

  const canCancel = item.status === "draft" || (item.status === "planned" && new Date(item.starts_at).getTime() > Date.now());

  async function cancel() {
    if (!window.confirm("Vil du aflyse vandlukningen og fjerne den fra den offentlige driftsstatus?")) return;
    try { await actions.update.mutateAsync({ status: "cancelled" }); } catch { /* Error is shown below. */ }
  }

  const mutationError = actions.update.error ?? actions.addAddress.error ?? actions.address.error ?? actions.bulkInformed.error ?? actions.incidents.error;
  return <div className="shutdown-detail-page"><Link className="back-link" to="/vandlukninger">← Tilbage til vandlukninger</Link>
    <header className="incident-detail-header"><div className="incident-detail-header__badges"><ShutdownStatusBadge status={item.status} /><span>{item.number}</span></div><h1>{item.title}</h1><p>{activityTypeLabels[item.activity_type] ?? "Vandlukning"} · {date(item.starts_at)}{item.expected_end_at ? ` til ${date(item.expected_end_at)}` : ""}</p></header>
    <div className="shutdown-detail-grid"><main><section className="detail-panel"><header><span className="eyebrow">Arbejdsbeskrivelse</span><h2>Plan</h2></header><p className="incident-description">{item.description}</p></section>
      <PublicStatusPanel sourceType="shutdown" sourceId={item.id} roles={user?.roles} showSeverity={false} initialDraft={{ title: item.title, message: item.description ?? "", areas: item.closure_areas.map((area) => area.name), start_at: item.starts_at, expected_end_at: item.expected_end_at ?? null, severity: "medium" }} />
      <section className="detail-panel"><header><span className="eyebrow">Afgrænsning</span><h2>Haner og lukkeområder</h2></header><div className="shutdown-chips"><div><strong>Valgte haner</strong><p>{item.valves.map((valve) => valve.code).join(", ") || "Ingen"}</p></div><div><strong>Afledte lukkeområder</strong><p>{item.closure_areas.map((area) => area.name).join(", ") || "Ingen"}</p></div></div></section>
      <section className="detail-panel"><header><span className="eyebrow">Relationer</span><h2>Tilknyttede hændelser</h2></header>{canMutate ? <IncidentRelations key={item.id} linked={item.incidents ?? []} pending={actions.incidents.isPending} save={(ids) => actions.incidents.mutateAsync(ids)} /> : <div className="relations">{(item.incidents ?? []).map((incident) => <Link to={`/haendelser/${incident.id}`} key={incident.id}>{incident.number} · {incident.title}<small>{statusLabels[incident.status]}</small></Link>)}{!item.incidents?.length && <p className="empty-copy">Ingen tilknyttede hændelser.</p>}</div>}</section>
      <section className="detail-panel address-panel"><header><div><span className="eyebrow">Kommunikation</span><h2>Berørte adresser</h2></div><a className="secondary-button" href={shutdownCsvUrl(item.id)} download>Hent CSV</a></header>{canMutate && <div className="address-tools"><label className="field">Tilføj adresse manuelt<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søg efter adresse" /></label>{query.trim().length >= 2 && <div className="address-search-results">{search.data?.filter((result) => result.type === "address" && !included.some((address) => address.id === result.id)).map((result) => <button type="button" key={result.id} onClick={async () => { try { await actions.addAddress.mutateAsync(result.id); setQuery(""); } catch { /* Error is shown below. */ } }}>{result.label}<small>{result.subtitle}</small></button>)}</div>}<div className="bulk-actions"><button type="button" disabled={pending || !included.length} onClick={() => actions.bulkInformed.mutate(true)}>Markér alle informeret</button><button type="button" disabled={pending || !included.length} onClick={() => actions.bulkInformed.mutate(false)}>Nulstil information</button></div></div>}
        <div className="address-table-wrap"><table className="address-table"><thead><tr><th>Adresse</th><th>Kilde</th><th>Informeret</th>{canMutate && <th><span className="sr-only">Handling</span></th>}</tr></thead><tbody>{included.map((address) => <tr key={address.id}><td>{addressLabel(address)}</td><td>{address.source === "manual" ? "Manuel" : "Lukkeområde"}</td><td>{canMutate ? <label className="informed-toggle"><input type="checkbox" checked={address.informed} disabled={pending} onChange={(e) => actions.address.mutate({ addressId: address.id, informed: e.target.checked })} /><span>{address.informed ? "Ja" : "Nej"}</span></label> : address.informed ? "Ja" : "Nej"}</td>{canMutate && <td><button className="text-button" type="button" disabled={pending} onClick={() => actions.address.mutate({ addressId: address.id, included: false })}>Udelad</button></td>}</tr>)}{!included.length && <tr><td colSpan={canMutate ? 4 : 3}>Ingen berørte adresser.</td></tr>}</tbody></table></div>
      </section></main><aside><section className="detail-panel incident-controls"><header><span className="eyebrow">Driftsstatus</span><h2>Nuværende status</h2></header><div className="shutdown-status-control"><div><span>Status</span><ShutdownStatusBadge status={item.status} /></div><p>Status skifter automatisk efter start- og sluttidspunktet.</p>{canMutate && canCancel && <div className="shutdown-status-actions"><button className="shutdown-status-action--danger" type="button" disabled={pending} onClick={() => void cancel()}>{actions.update.isPending ? "Aflyser…" : "Aflys vandlukning"}</button></div>}</div></section><section className="detail-panel facts-panel"><header><span className="eyebrow">Nøgletal</span><h2>Detaljer</h2></header><dl><div><dt>Ansvarlig</dt><dd>{item.assigned_to?.display_name ?? "Ikke tildelt"}</dd></div><div><dt>Entreprenør</dt><dd>{item.contractor || "Ikke angivet"}</dd></div><div><dt>Berørte adresser</dt><dd>{included.length}</dd></div><div><dt>Informeret</dt><dd>{included.filter((address) => address.informed).length} af {included.length}</dd></div></dl></section></aside></div>{mutationError && <div className="mutation-toast" role="alert">{mutationError.message}</div>}
  </div>;
}
