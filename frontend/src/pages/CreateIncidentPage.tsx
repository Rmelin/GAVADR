import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useCurrentUser } from "../hooks/useAuth";
import { useCreateIncident, useUserOptions } from "../hooks/useIncidents";
import { useMapData, useMapSearch } from "../hooks/useMapData";
import { IncidentPlacementMap } from "../incidents/IncidentPlacementMap";
import { canMutateIncidents, priorityLabels, typeLabels } from "../types/incidents";
import type { MapSearchResult } from "../types/map";
import { useAppSettings } from "../hooks/useAppSettings";

interface FormState { title: string; description: string; type: string; priority: string; longitude: string; latitude: string; assigned_to_id: string; expected_end_at: string }
const initial: FormState = { title: "", description: "", type: "confirmed_leak", priority: "high", longitude: "", latitude: "", assigned_to_id: "", expected_end_at: "" };

const automaticTitlePrefixes: Record<string, string> = {
  suspected_leak: "Brud ud for", confirmed_leak: "Brud ud for", pressure_drop: "Trykfald ved",
  no_water: "Manglende vand ved", discolored_water: "Misfarvet vand ved", planned_work: "Planlagt arbejde ved",
  defective_valve: "Defekt hane ved", map_error: "Kortfejl ved", other_operational_disruption: "Driftsforstyrrelse ved",
};

export function automaticIncidentTitle(type: string, address: string, now = new Date()) {
  const date = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long", year: "numeric" }).format(now);
  return `${automaticTitlePrefixes[type] ?? "Hændelse ved"} ${address} den ${date}`;
}

export function CreateIncidentPage() {
  const [searchParams] = useSearchParams();
  const queryLongitude = Number(searchParams.get("lng"));
  const queryLatitude = Number(searchParams.get("lat"));
  const queryPlace = searchParams.get("place")?.trim() ?? "";
  const hasMapPrefill = searchParams.has("lng") && searchParams.has("lat") && Number.isFinite(queryLongitude) && Number.isFinite(queryLatitude) && queryLongitude >= -180 && queryLongitude <= 180 && queryLatitude >= -90 && queryLatitude <= 90;
  const { data: user, isLoading: authLoading } = useCurrentUser();
  const canMutate = canMutateIncidents(user?.roles);
  const [form, setForm] = useState<FormState>(() => hasMapPrefill ? { ...initial, longitude: String(queryLongitude), latitude: String(queryLatitude), title: queryPlace ? automaticIncidentTitle(initial.type, queryPlace) : "" } : initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locationMethod, setLocationMethod] = useState<"address" | "map">(hasMapPrefill ? "map" : "address");
  const [addressQuery, setAddressQuery] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<MapSearchResult>();
  const [manualTitle, setManualTitle] = useState(false);
  const addressSearch = useMapSearch(addressQuery);
  const users = useUserOptions(canMutate);
  const mapData = useMapData();
  const { data: appSettings } = useAppSettings();
  const create = useCreateIncident();
  const navigate = useNavigate();
  const set = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const setAutomaticTitle = (type = form.type, address = selectedAddress) => {
    const place = address?.label ?? (hasMapPrefill ? queryPlace : "");
    if (place) set("title", automaticIncidentTitle(type, place));
  };

  if (authLoading) return <div className="incident-state" role="status"><span className="loader" />Kontrollerer adgang…</div>;
  if (!canMutate) return <Navigate to="/haendelser" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.title.trim()) nextErrors.title = "Skriv en titel.";
    const longitude = Number(form.longitude.replace(",", "."));
    const latitude = Number(form.latitude.replace(",", "."));
    if (locationMethod === "address" && !selectedAddress) nextErrors.address = "Vælg en adresse fra søgeresultaterne.";
    if (locationMethod === "map" && (!form.longitude || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)) nextErrors.longitude = "Indtast en gyldig længdegrad.";
    if (locationMethod === "map" && (!form.latitude || !Number.isFinite(latitude) || latitude < -90 || latitude > 90)) nextErrors.latitude = "Indtast en gyldig breddegrad.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      const incident = await create.mutateAsync({
        title: form.title.trim(), description: form.description.trim(), type: form.type, priority: form.priority,
        ...(locationMethod === "address" && selectedAddress ? { address_id: selectedAddress.id } : { longitude, latitude }),
        ...(form.assigned_to_id && { assigned_to_id: form.assigned_to_id }),
        ...(form.expected_end_at && { expected_end_at: new Date(form.expected_end_at).toISOString() }),
      });
      navigate(`/haendelser/${incident.id}`);
    } catch {
      // The mutation error is rendered below the form.
    }
  }

  return <div className="incident-form-page">
    <header className="incident-page-heading"><div><Link className="back-link" to="/haendelser">← Tilbage til hændelser</Link><span className="eyebrow">Ny registrering</span><h1>Registrer hændelse</h1><p>Giv vagtlaget et præcist fælles udgangspunkt.</p></div></header>
    <ol className="form-progress" aria-label="Registreringens trin"><li className="is-active"><span>1</span>Placering</li><li><span>2</span>Hændelse</li><li><span>3</span>Plan og ansvar</li></ol>
    <form className="incident-create-form" onSubmit={submit} noValidate>
      <section className="form-section"><header><span>01</span><div><h2>Hvor er hændelsen?</h2><p>Søg som udgangspunkt efter en adresse, eller placér hændelsen direkte på kortet.</p></div></header><div className="location-entry">
        <div className="location-method" role="group" aria-label="Vælg placeringsmetode"><button type="button" className={locationMethod === "address" ? "is-active" : ""} onClick={() => setLocationMethod("address")}>Dansk adresse</button><button type="button" className={locationMethod === "map" ? "is-active" : ""} onClick={() => setLocationMethod("map")}>Angiv på kort</button></div>
        {locationMethod === "address" ? <div className="address-entry"><label className="field">Søg efter adresse<input value={addressQuery} onChange={(e) => { setAddressQuery(e.target.value); setSelectedAddress(undefined); }} placeholder="Skriv vejnavn og husnummer" autoComplete="off" aria-invalid={Boolean(errors.address)} /></label>{errors.address && <small className="field-error">{errors.address}</small>}
          {addressQuery.trim().length >= 2 && !selectedAddress && <div className="address-search-results">{addressSearch.data?.filter((result) => result.type === "address").map((result) => <button type="button" key={result.id} onClick={() => { setSelectedAddress(result); setAddressQuery(`${result.label}, ${result.subtitle}`); setErrors((current) => ({ ...current, address: "" })); if (!manualTitle) setAutomaticTitle(form.type, result); }}>{result.label}<small>{result.subtitle}</small></button>)}</div>}
          {selectedAddress && <div className="selected-address"><span><strong>{selectedAddress.label}</strong><small>{selectedAddress.subtitle}</small></span><button type="button" onClick={() => { setSelectedAddress(undefined); setAddressQuery(""); }}>Skift adresse</button></div>}
        </div> : <>{hasMapPrefill && <div className="map-prefill-note" role="status"><strong>Placering valgt i Ledningskortet</strong><span>{queryPlace || "Kortplacering"}. Placeringen og titlen kan redigeres.</span></div>}<IncidentPlacementMap longitude={form.longitude ? Number(form.longitude) : undefined} latitude={form.latitude ? Number(form.latitude) : undefined} defaultLongitude={appSettings.map_default_longitude} defaultLatitude={appSettings.map_default_latitude} defaultZoom={appSettings.map_default_zoom} pipes={mapData.pipes.data} valves={mapData.valves.data} onChange={(lng, lat) => setForm((current) => ({ ...current, longitude: lng.toFixed(6), latitude: lat.toFixed(6) }))} /><div className="coordinate-fields">
          <label className="field">Længdegrad<input inputMode="decimal" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} aria-invalid={Boolean(errors.longitude)} />{errors.longitude && <small className="field-error">{errors.longitude}</small>}</label>
          <label className="field">Breddegrad<input inputMode="decimal" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} aria-invalid={Boolean(errors.latitude)} />{errors.latitude && <small className="field-error">{errors.latitude}</small>}</label>
        </div></>}
      </div></section>
      <section className="form-section"><header><span>02</span><div><h2>Hvad er sket?</h2><p>Vælg type og beskriv observationen kort og operationelt.</p></div></header><div className="form-fields">
        <label className="field">Type<select value={form.type} onChange={(e) => { set("type", e.target.value); if (!manualTitle) setAutomaticTitle(e.target.value); }}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field">Prioritet<select value={form.priority} onChange={(e) => set("priority", e.target.value)}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="field field--wide title-field"><span><label htmlFor="incident-title">Titel</label>{manualTitle && (selectedAddress || (hasMapPrefill && queryPlace)) && <button type="button" onClick={() => { setManualTitle(false); setAutomaticTitle(); }}>Brug automatisk titel</button>}</span><input id="incident-title" value={form.title} onChange={(e) => { set("title", e.target.value); setManualTitle(true); }} aria-invalid={Boolean(errors.title)} />{errors.title && <small className="field-error">{errors.title}</small>}</div>
        <label className="field field--wide">Beskrivelse <small>(valgfri)</small><textarea rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
      </div></section>
      <section className="form-section"><header><span>03</span><div><h2>Plan og ansvar</h2><p>Kan udfyldes nu eller tildeles senere.</p></div></header><div className="form-fields">
        <label className="field">Ansvarlig<select value={form.assigned_to_id} onChange={(e) => set("assigned_to_id", e.target.value)}><option value="">Ikke tildelt</option>{users.data?.map((option) => <option value={option.id} key={option.id}>{option.display_name}{option.email ? ` · ${option.email}` : ""}</option>)}</select></label>
        <label className="field">Forventet afslutning<input type="datetime-local" value={form.expected_end_at} onChange={(e) => set("expected_end_at", e.target.value)} /></label>
      </div></section>
      {create.isError && <div className="form-error" role="alert">{create.error.message}</div>}
       <footer className="form-actions"><Link className="secondary-button" to="/haendelser" onClick={(event) => { if ((form.title || form.description || form.longitude || form.latitude || selectedAddress) && !window.confirm("Vil du forlade registreringen? Dine indtastninger gemmes ikke.")) event.preventDefault(); }}>Annuller</Link><button className="primary-button" disabled={create.isPending} type="submit">{create.isPending ? "Registrerer…" : "Registrer hændelse"}</button></footer>
    </form>
  </div>;
}
