import { useEffect, useState, type FormEvent } from "react";
import type { AddressImportReport } from "../api/appSettings";
import { useAddressImport, useAppSettings, useUpdateAppSettings } from "../hooks/useAppSettings";
import { IncidentPlacementMap } from "../incidents/IncidentPlacementMap";

export function AppSettingsPage() {
  const settings = useAppSettings();
  const update = useUpdateAppSettings();
  const addressImport = useAddressImport();
  const [form, setForm] = useState({ organization_name: "", organization_address: "", organization_locality: "" });
  const [mapCenter, setMapCenter] = useState({ longitude: 11.45, latitude: 55.62 });
  const [mapZoom, setMapZoom] = useState(13);
  const [file, setFile] = useState<File>();
  const [crs, setCrs] = useState<"EPSG:25832" | "EPSG:4326">("EPSG:25832");
  const [report, setReport] = useState<AddressImportReport>();

  useEffect(() => {
    setForm({ organization_name: settings.data.organization_name, organization_address: settings.data.organization_address, organization_locality: settings.data.organization_locality });
    setMapCenter({ longitude: settings.data.map_default_longitude, latitude: settings.data.map_default_latitude });
    setMapZoom(settings.data.map_default_zoom);
  }, [settings.data]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.organization_name.trim()) return;
    try { await update.mutateAsync({ ...form, organization_name: form.organization_name.trim(), organization_address: form.organization_address.trim(), organization_locality: form.organization_locality.trim(), map_default_longitude: mapCenter.longitude, map_default_latitude: mapCenter.latitude, map_default_zoom: mapZoom }); } catch { /* Error is shown below. */ }
  }

  async function runImport(commit: boolean) {
    if (!file) return;
    try { setReport(await addressImport.mutateAsync({ file, crs, commit })); } catch { /* Error is shown below. */ }
  }

  function downloadErrors(result: AddressImportReport) {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = ["raekke;fejl", ...result.errors.map((error) => `${error.row};${escape(error.message)}`)].join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}\n`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result.filename.replace(/\.csv$/i, "")}-fejl.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const canCommit = report && !report.committed && report.new_rows > 0;
  return <div className="settings-page">
    <header className="settings-heading"><div><span className="eyebrow">Administration</span><h1>App-indstillinger</h1><p>Tilpas vandværkets offentlige identitet og administrér forsyningsadresser.</p></div></header>

    <section className="settings-panel"><header><div><span className="eyebrow">Identitet</span><h2>Vandværkets oplysninger</h2></div><p>Vises i driftssystemet, på login og på den offentlige driftsstatus.</p></header><form className="settings-form" onSubmit={(event) => void save(event)}>
      <label className="field">Navn<input required maxLength={120} value={form.organization_name} onChange={(event) => setForm({ ...form, organization_name: event.target.value })} placeholder="Eksempel Vandværk" /></label>
      <label className="field">Adresse<input maxLength={200} value={form.organization_address} onChange={(event) => setForm({ ...form, organization_address: event.target.value })} placeholder="Vandværksvej 1" /></label>
      <label className="field">Lokalitet<input maxLength={120} value={form.organization_locality} onChange={(event) => setForm({ ...form, organization_locality: event.target.value })} placeholder="4293 Dianalund" /></label>
      <div className="settings-map-field"><div><span className="eyebrow">Kort</span><h3>Standardudsnit for kort</h3><p>Flyt og zoom kortet til det udsnit, som Overblik, Ledningskort og nye hændelser skal åbne ved. Klik for at flytte centrum.</p></div><IncidentPlacementMap longitude={mapCenter.longitude} latitude={mapCenter.latitude} zoom={mapZoom} onChange={(longitude, latitude) => setMapCenter({ longitude: Number(longitude.toFixed(6)), latitude: Number(latitude.toFixed(6)) })} onZoomChange={(value) => setMapZoom(Number(value.toFixed(1)))} /><div className="coordinate-fields"><label className="field">Længdegrad<input type="number" min={-180} max={180} step="any" value={mapCenter.longitude} onChange={(event) => setMapCenter({ ...mapCenter, longitude: Number(event.target.value) })} /></label><label className="field">Breddegrad<input type="number" min={-90} max={90} step="any" value={mapCenter.latitude} onChange={(event) => setMapCenter({ ...mapCenter, latitude: Number(event.target.value) })} /></label><label className="field">Zoom<input type="number" min={0} max={19} step={0.1} value={mapZoom} onChange={(event) => setMapZoom(Number(event.target.value))} /></label></div></div>
      {update.isError && <div className="form-error" role="alert">{update.error.message}</div>}
      {update.isSuccess && <div className="settings-success" role="status">Indstillingerne er gemt og vises med det samme.</div>}
      <button className="primary-button" disabled={update.isPending || !form.organization_name.trim()}>{update.isPending ? "Gemmer…" : "Gem indstillinger"}</button>
    </form></section>

    <section className="settings-panel"><header><div><span className="eyebrow">Grunddata</span><h2>Importér adresser fra CSV</h2></div><p>Filen kontrolleres altid, før adresserne kan oprettes.</p></header><div className="address-import">
      <div className="import-requirements"><strong>Krævede kolonner</strong><code>adresse;postnummer;lokalitet;x;y</code><p>Alternativt kan <code>vejnavn</code> og <code>husnummer</code> bruges hver for sig. Valgfrie kolonner: <code>eksternt_adresse_id</code>, <code>aktiv</code> og <code>noter</code>.</p></div>
      <div className="import-fields"><label className="field">CSV-fil<input type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0]); setReport(undefined); }} /></label><label className="field">Koordinatsystem<select value={crs} onChange={(event) => { setCrs(event.target.value as typeof crs); setReport(undefined); }}><option value="EPSG:25832">EPSG:25832 · ETRS89 / UTM 32N</option><option value="EPSG:4326">EPSG:4326 · længde-/breddegrad</option></select></label></div>
      <button className="secondary-button" type="button" disabled={!file || addressImport.isPending} onClick={() => void runImport(false)}>{addressImport.isPending ? "Kontrollerer…" : "Kontrollér fil"}</button>
      {addressImport.isError && <div className="form-error" role="alert">{addressImport.error.message}</div>}
      {report && <div className={`import-report${report.errors.length ? " import-report--error" : ""}`}><header><strong>{report.committed ? report.errors.length ? "Import gennemført med oversprungne rækker" : "Import gennemført" : report.errors.length ? "Klar til delvis import" : "Klar til import"}</strong><span>{report.filename}</span></header><dl><div><dt>Rækker</dt><dd>{report.rows}</dd></div><div><dt>Gyldige nye</dt><dd>{report.new_rows}</dd></div><div><dt>Springes over</dt><dd>{report.skipped_rows}</dd></div><div><dt>Oprettet</dt><dd>{report.created_rows}</dd></div></dl>{report.errors.length > 0 && <div className="import-errors"><div><p><strong>{report.errors.length} rækker kan ikke importeres.</strong> Ret dem i kildefilen med rækkenumrene nedenfor.</p><button className="secondary-button" type="button" onClick={() => downloadErrors(report)}>Hent alle fejl som CSV</button></div><ul>{report.errors.slice(0, 50).map((error, index) => <li key={`${error.row}-${index}`}><strong>Række {error.row}</strong>{error.message}</li>)}</ul>{report.errors.length > 50 && <p>Listen viser de første 50 fejl. Hent CSV-filen for at se alle {report.errors.length}.</p>}</div>}{canCommit && <div className="import-confirm"><p>Importen opretter {report.new_rows} gyldige adresser og springer {report.skipped_rows} rækker over. Eksisterende adresser ændres ikke.</p><button className="primary-button" type="button" disabled={addressImport.isPending} onClick={() => void runImport(true)}>{addressImport.isPending ? "Importerer…" : report.errors.length ? "Importér gyldige rækker" : "Bekræft og importér"}</button></div>}</div>}
      <p className="import-note">Importerede adresser kobles ikke automatisk til lukkeområder. Denne relation skal fortsat kontrolleres fagligt i QGIS.</p>
    </div></section>
  </div>;
}
