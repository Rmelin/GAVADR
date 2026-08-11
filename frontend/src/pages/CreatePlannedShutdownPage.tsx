import { type FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useCurrentUser } from "../hooks/useAuth";
import { useIncidents, useUserOptions } from "../hooks/useIncidents";
import { useMapData, useMapSearch } from "../hooks/useMapData";
import { useCreatePlannedShutdown } from "../hooks/usePlannedShutdowns";
import { canMutateShutdowns } from "../types/plannedShutdowns";
import { statusLabels } from "../types/incidents";

const featureId = (feature: { id?: string | number; properties: Record<string, unknown> }) => String(feature.properties.id ?? feature.id ?? "");
const addressLabel = (properties: Record<string, unknown>) => `${properties.street_name ?? ""} ${properties.house_number ?? ""}, ${properties.postal_code ?? ""} ${properties.city ?? ""}`.replace(/\s+/g, " ").trim();

export function CreatePlannedShutdownPage() {
  const [searchParams] = useSearchParams();
  const { data: user, isLoading: authLoading } = useCurrentUser();
  const canMutate = canMutateShutdowns(user?.roles);
  const users = useUserOptions(canMutate);
  const incidents = useIncidents([], "");
  const map = useMapData();
  const create = useCreatePlannedShutdown();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", description: "", start_at: "", end_at: "", responsible_id: "", contractor: "" });
  const [valveIds, setValveIds] = useState<string[]>(() => [...new Set(searchParams.getAll("valve_ids").flatMap((value) => value.split(",")).filter(Boolean))]);
  const fromMap = searchParams.get("source") === "map" && valveIds.length > 0;
  const [manualAddressIds, setManualAddressIds] = useState<string[]>([]);
  const [incidentIds, setIncidentIds] = useState<string[]>([]);
  const [addressQuery, setAddressQuery] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const search = useMapSearch(addressQuery);

  const derived = useMemo(() => {
    const areas = map.closureAreas.data?.features.filter((area) => {
      const scenarios = area.properties.closure_scenarios;
      return Array.isArray(scenarios) && scenarios.some((scenario) => scenario.valve_ids.length > 0 && scenario.valve_ids.every((id) => valveIds.includes(id)));
    }) ?? [];
    const addressIds = new Set(areas.flatMap((area) => Array.isArray(area.properties.address_ids) ? area.properties.address_ids.map(String) : []));
    manualAddressIds.forEach((id) => addressIds.add(id));
    const addresses = map.addresses.data?.features.filter((address) => addressIds.has(featureId(address))) ?? [];
    return { areas, addresses };
  }, [map.addresses.data, map.closureAreas.data, manualAddressIds, valveIds]);

  if (authLoading) return <div className="incident-state" role="status">Kontrollerer adgang…</div>;
  if (!canMutate) return <Navigate to="/vandlukninger" replace />;
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (form.title.trim().length < 3) nextErrors.title = "Skriv en titel på mindst 3 tegn.";
    else if (form.title.trim().length > 200) nextErrors.title = "Titlen må højst være 200 tegn.";
    if (form.description.trim().length < 10) nextErrors.description = "Beskriv arbejdet med mindst 10 tegn.";
    if (!form.start_at) nextErrors.start_at = "Vælg starttidspunkt.";
    if (!form.end_at || (form.start_at && form.end_at <= form.start_at)) nextErrors.end_at = "Sluttidspunktet skal ligge efter start.";
    if (!valveIds.length) nextErrors.valves = "Vælg mindst én hane.";
    if (form.contractor.trim().length > 200) nextErrors.contractor = "Entreprenøren må højst være 200 tegn.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      const result = await create.mutateAsync({ title: form.title.trim(), description: form.description.trim(), starts_at: new Date(form.start_at).toISOString(), expected_end_at: new Date(form.end_at).toISOString(), valve_ids: valveIds, incident_ids: incidentIds, ...(form.responsible_id && { assigned_to_id: form.responsible_id }), ...(form.contractor.trim() && { contractor: form.contractor.trim() }), ...(manualAddressIds.length && { included_address_ids: manualAddressIds }) });
      navigate(`/vandlukninger/${result.id}`);
    } catch { /* Mutation error is shown below. */ }
  }

  return <div className="shutdown-form-page"><header className="incident-page-heading"><div><Link className="back-link" to="/vandlukninger">← Tilbage til vandlukninger</Link><span className="eyebrow">Ny plan</span><h1>Opret vandlukning</h1><p>Afgræns lukningen og kontrollér adresselisten før oprettelse.</p></div></header>
    <form className="incident-create-form" onSubmit={submit} noValidate>
      <section className="form-section"><header><span>01</span><div><h2>Arbejde og tidsrum</h2><p>Beskriv hvad der skal ske og hvornår.</p></div></header><div className="form-fields"><label className="field field--wide">Titel<input maxLength={200} value={form.title} onChange={(e) => set("title", e.target.value)} aria-invalid={Boolean(errors.title)} />{errors.title && <small className="field-error">{errors.title}</small>}</label><label className="field">Start<input type="datetime-local" value={form.start_at} onChange={(e) => set("start_at", e.target.value)} aria-invalid={Boolean(errors.start_at)} />{errors.start_at && <small className="field-error">{errors.start_at}</small>}</label><label className="field">Slut<input type="datetime-local" value={form.end_at} onChange={(e) => set("end_at", e.target.value)} aria-invalid={Boolean(errors.end_at)} />{errors.end_at && <small className="field-error">{errors.end_at}</small>}</label><label className="field field--wide">Beskrivelse<textarea rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} aria-invalid={Boolean(errors.description)} />{errors.description && <small className="field-error">{errors.description}</small>}</label></div></section>
      <section className="form-section"><header><span>02</span><div><h2>Haner og lukkeområder</h2><p>Et område medtages, når alle haner i mindst ét af områdets lukkescenarier er valgt.</p></div></header><div>{fromMap && <div className="map-prefill-note" role="status"><strong>Valgt i Ledningskortet</strong><span>{valveIds.length} {valveIds.length === 1 ? "hane er" : "haner er"} forvalgt. Du kan ændre valget nedenfor.</span></div>}<fieldset className="valve-picker"><legend>Haner</legend>{map.valves.isLoading && <p>Indlæser haner…</p>}{map.valves.data?.features.map((valve) => { const id = featureId(valve); const code = String(valve.properties.code ?? id); return <label key={id}><input type="checkbox" checked={valveIds.includes(id)} onChange={(event) => setValveIds((current) => event.target.checked ? [...current, id] : current.filter((value) => value !== id))} /><span><strong>{code}</strong><small>{String(valve.properties.status ?? "Status ikke angivet")}</small></span></label>; })}</fieldset>{errors.valves && <small className="field-error">{errors.valves}</small>}<div className="derived-summary"><strong>{derived.areas.length} lukkeområder</strong><span>{derived.areas.map((area) => String(area.properties.name ?? featureId(area))).join(", ") || "Ingen komplette scenarier opfyldt"}</span></div></div></section>
      <section className="form-section"><header><span>03</span><div><h2>Berørte adresser</h2><p>Kontrollér de afledte adresser og tilføj eventuelle undtagelser.</p></div></header><div><label className="field">Søg og tilføj adresse<input value={addressQuery} onChange={(e) => setAddressQuery(e.target.value)} placeholder="Skriv vejnavn eller adresse" /></label>{addressQuery.trim().length >= 2 && <div className="address-search-results">{search.data?.filter((result) => result.type === "address").map((result) => <button type="button" key={result.id} disabled={manualAddressIds.includes(result.id)} onClick={() => { setManualAddressIds((current) => [...current, result.id]); setAddressQuery(""); }}>{result.label}<small>{result.subtitle}</small></button>)}</div>}<div className="address-preview"><strong>{derived.addresses.length} berørte adresser</strong><ul>{derived.addresses.map((address) => <li key={featureId(address)}>{addressLabel(address.properties)}{manualAddressIds.includes(featureId(address)) && <span>Manuelt tilføjet</span>}</li>)}</ul></div></div></section>
      <section className="form-section"><header><span>04</span><div><h2>Ansvar og udførelse</h2><p>Angiv intern ansvarlig og eventuel entreprenør.</p></div></header><div className="form-fields"><label className="field">Ansvarlig<select value={form.responsible_id} onChange={(e) => set("responsible_id", e.target.value)}><option value="">Ikke tildelt</option>{users.data?.map((option) => <option value={option.id} key={option.id}>{option.display_name}</option>)}</select></label><label className="field">Entreprenør<input maxLength={200} value={form.contractor} onChange={(e) => set("contractor", e.target.value)} aria-invalid={Boolean(errors.contractor)} />{errors.contractor && <small className="field-error">{errors.contractor}</small>}</label></div></section>
      <section className="form-section"><header><span>05</span><div><h2>Tilknyttede hændelser</h2><p>Vælg eventuelle hændelser, som vandlukningen udføres i forbindelse med.</p></div></header><fieldset className="incident-relation-picker"><legend className="sr-only">Hændelser</legend>{incidents.isLoading && <p>Indlæser hændelser…</p>}{Array.isArray(incidents.data) && incidents.data.map((incident) => <label key={incident.id}><input type="checkbox" checked={incidentIds.includes(incident.id)} onChange={(event) => setIncidentIds((current) => event.target.checked ? [...current, incident.id] : current.filter((id) => id !== incident.id))} /><span><strong>{incident.number} · {incident.title}</strong><small>{statusLabels[incident.status]}</small></span></label>)}{Array.isArray(incidents.data) && incidents.data.length === 0 && <p className="empty-copy">Ingen hændelser at tilknytte.</p>}</fieldset></section>
      {create.isError && <div className="form-error" role="alert">{create.error.message}</div>}<footer className="form-actions"><Link className="secondary-button" to="/vandlukninger">Annuller</Link><button className="primary-button" type="submit" disabled={create.isPending}>{create.isPending ? "Opretter…" : "Opret vandlukning"}</button></footer>
    </form>
  </div>;
}
