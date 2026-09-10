import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { SingleSelectButtonGroup } from "../components/SingleSelectButtonGroup";
import { useAppSettings } from "../hooks/useAppSettings";
import { useCurrentUser } from "../hooks/useAuth";
import { useUserOptions } from "../hooks/useIncidents";
import { useCreateMapCorrection, useSupplierOptions } from "../hooks/useMapCorrections";
import { useMapData, useMapSearch } from "../hooks/useMapData";
import { IncidentPlacementMap } from "../incidents/IncidentPlacementMap";
import { inquiryPriorityLabels, type InquiryPriority } from "../types/inquiries";
import { canCreateCorrections, correctionCategoryLabels } from "../types/mapCorrections";
import type { MapSearchResult } from "../types/map";

const validCoordinate = (value: string, minimum: number, maximum: number) => {
  const number = Number(value.replace(",", "."));
  return value.trim() !== "" && Number.isFinite(number) && number >= minimum && number <= maximum;
};

export function CreateMapCorrectionPage() {
  const { data: user, isLoading } = useCurrentUser();
  const allowed = canCreateCorrections(user?.roles);
  const [params] = useSearchParams();
  const queryLongitude = params.get("lng") ?? "";
  const queryLatitude = params.get("lat") ?? "";
  const hasMapPrefill = validCoordinate(queryLongitude, -180, 180) && validCoordinate(queryLatitude, -90, 90);
  const [form, setForm] = useState({
    title: "", description: "", category: "new_pipe", priority: "medium",
    longitude: hasMapPrefill ? queryLongitude : "", latitude: hasMapPrefill ? queryLatitude : "",
    assigned_to_id: "", inquiry_id: params.get("inquiry_id") ?? "", supplier_id: "",
  });
  const [locationMethod, setLocationMethod] = useState<"map" | "address">("map");
  const [addressQuery, setAddressQuery] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<MapSearchResult>();
  const [placementError, setPlacementError] = useState("");
  const users = useUserOptions(allowed);
  const suppliers = useSupplierOptions(allowed);
  const addressSearch = useMapSearch(addressQuery);
  const mapData = useMapData();
  const { data: appSettings } = useAppSettings();
  const create = useCreateMapCorrection();
  const navigate = useNavigate();
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  if (isLoading) return <div className="incident-state">Kontrollerer adgang…</div>;
  if (!allowed) return <Navigate to="/kortrettelser" replace />;
  const boardOnly = user?.roles.includes("board_member") && !user.roles.some((role) => ["admin", "map_manager"].includes(role));

  function setPoint(longitude: number, latitude: number) {
    setForm((current) => ({ ...current, longitude: longitude.toFixed(6), latitude: latitude.toFixed(6) }));
    setSelectedAddress(undefined);
    setPlacementError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locationMethod === "address" && !selectedAddress) {
      setPlacementError("Vælg en kendt adresse fra søgeresultaterne.");
      return;
    }
    if (!validCoordinate(form.longitude, -180, 180) || !validCoordinate(form.latitude, -90, 90)) {
      setPlacementError("Klik i kortet for at placere kortrettelsen.");
      return;
    }
    try {
      const item = await create.mutateAsync({
        title: form.title.trim(), description: form.description.trim(), category: form.category,
        priority: form.priority as InquiryPriority,
        longitude: Number(form.longitude.replace(",", ".")), latitude: Number(form.latitude.replace(",", ".")),
        assigned_to_id: form.assigned_to_id || null, inquiry_id: form.inquiry_id || null,
        supplier_id: form.supplier_id || null,
      });
      navigate(`/kortrettelser/${item.id}`);
    } catch { /* Error is rendered below. */ }
  }

  return <div className="work-page">
    <Link className="back-link" to="/kortrettelser">← Tilbage til kortrettelser</Link>
    <header className="incident-page-heading"><div><span className="eyebrow">Ny kortændring</span><h1>Opret kortrettelse</h1><p>Sæt en digital post-it præcis dér, hvor kortet skal ændres.</p></div></header>
    <form className="incident-create-form" onSubmit={submit}>
      <section className="form-section"><header><span>01</span><div><h2>Hvor skal kortet ændres?</h2><p>Klik helst punktet direkte i kortet. En kendt adresse kan bruges som alternativ.</p></div></header><div className="location-entry">
        <div className="location-method" role="group" aria-label="Vælg placeringsmetode"><button type="button" className={locationMethod === "map" ? "is-active" : ""} onClick={() => { setLocationMethod("map"); setPlacementError(""); }}>Klik i kortet</button><button type="button" className={locationMethod === "address" ? "is-active" : ""} onClick={() => { setLocationMethod("address"); setPlacementError(""); }}>Find adresse</button></div>
        {locationMethod === "map" ? <>
          <IncidentPlacementMap
            longitude={validCoordinate(form.longitude, -180, 180) ? Number(form.longitude) : undefined}
            latitude={validCoordinate(form.latitude, -90, 90) ? Number(form.latitude) : undefined}
            defaultLongitude={appSettings.map_default_longitude} defaultLatitude={appSettings.map_default_latitude} defaultZoom={appSettings.map_default_zoom}
            pipes={mapData.pipes.data} valves={mapData.valves.data} onChange={setPoint}
            ariaLabel="Kort til placering af kortrettelsen" hint="Klik i kortet for at sætte kortrettelsen"
          />
          {hasMapPrefill && <div className="map-prefill-note" role="status"><strong>Placering overført fra Ledningskortet</strong><span>Klik et andet sted, hvis punktet skal flyttes.</span></div>}
          <div className="coordinate-fields">
            <label className="field">Længdegrad<input inputMode="decimal" value={form.longitude} onChange={(event) => { set("longitude", event.target.value); setPlacementError(""); }} aria-invalid={Boolean(placementError)} /></label>
            <label className="field">Breddegrad<input inputMode="decimal" value={form.latitude} onChange={(event) => { set("latitude", event.target.value); setPlacementError(""); }} aria-invalid={Boolean(placementError)} /></label>
          </div>
        </> : <div className="address-entry">
          <label className="field">Søg efter adresse<input value={addressQuery} onChange={(event) => { setAddressQuery(event.target.value); setSelectedAddress(undefined); setForm((current) => ({ ...current, longitude: "", latitude: "" })); setPlacementError(""); }} placeholder="Skriv vejnavn og husnummer" autoComplete="off" aria-invalid={Boolean(placementError)} /></label>
          {addressQuery.trim().length >= 2 && !selectedAddress && <div className="address-search-results">{addressSearch.isLoading && <p className="address-search-state">Søger…</p>}{addressSearch.data?.filter((result) => result.type === "address").map((result) => <button type="button" key={result.id} onClick={() => { setSelectedAddress(result); setAddressQuery(`${result.label}, ${result.subtitle}`); setForm((current) => ({ ...current, longitude: result.longitude.toFixed(6), latitude: result.latitude.toFixed(6) })); setPlacementError(""); }}>{result.label}<small>{result.subtitle}</small></button>)}{addressSearch.data && !addressSearch.data.some((result) => result.type === "address") && <p className="address-search-state">Ingen kendte adresser fundet.</p>}</div>}
          {selectedAddress && <div className="selected-address"><span><strong>{selectedAddress.label}</strong><small>{selectedAddress.subtitle}</small></span><button type="button" onClick={() => { setSelectedAddress(undefined); setAddressQuery(""); setForm((current) => ({ ...current, longitude: "", latitude: "" })); }}>Skift adresse</button></div>}
        </div>}
        {placementError && <small className="field-error correction-placement-error">{placementError}</small>}
      </div></section>
      <section className="form-section"><header><span>02</span><div><h2>Hvad skal ændres?</h2><p>Beskriv det, som tidligere ville stå på post-it-sedlen på det fysiske kort.</p></div></header><div className="form-fields">
        <SingleSelectButtonGroup className="field--wide" label="Type af kortændring" value={form.category} onChange={(value) => set("category", value)} options={Object.entries(correctionCategoryLabels).map(([value, label]) => ({ value, label }))} />
        <label className="field field--wide">Kort overskrift<input required maxLength={200} value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Fx Ny hovedstophane ved Skovkæret" /></label>
        <label className="field field--wide">Hvad ved vi?<textarea required rows={5} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Beskriv hvad der er lagt, opsat eller mangler at blive indmålt og indtegnet." /></label>
        <SingleSelectButtonGroup className="field--wide" label="Prioritet" value={form.priority} onChange={(value) => set("priority", value)} options={Object.entries(inquiryPriorityLabels).map(([value, label]) => ({ value, label }))} />
      </div></section>
      <section className="form-section"><header><span>03</span><div><h2>Ansvar og relation</h2><p>Kan tildeles nu eller behandles senere.</p></div></header><div className="form-fields">
        <label className="field">Ansvarlig<select value={form.assigned_to_id} onChange={(event) => set("assigned_to_id", event.target.value)}><option value="">Ikke tildelt</option>{users.data?.map((option) => <option value={option.id} key={option.id}>{option.display_name}</option>)}</select></label>
        <label className="field">Leverandør<select value={form.supplier_id} onChange={(event) => set("supplier_id", event.target.value)}><option value="">Ikke valgt</option>{suppliers.data?.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
        <label className="field field--wide">Tilknyttet henvendelse, ID<input required={boardOnly} value={form.inquiry_id} onChange={(event) => set("inquiry_id", event.target.value)} /></label>
        {boardOnly && <p className="field field--wide">Som bestyrelsesmedlem kan du kun oprette en kortrettelse fra en henvendelse.</p>}
      </div></section>
      {create.isError && <div className="form-error">{create.error.message}</div>}
      <footer className="form-actions"><Link className="secondary-button" to="/kortrettelser">Annuller</Link><button className="primary-button" disabled={create.isPending}>{create.isPending ? "Opretter…" : "Opret kortrettelse"}</button></footer>
    </form>
  </div>;
}
