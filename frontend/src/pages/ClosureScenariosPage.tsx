import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAppSettings } from "../hooks/useAppSettings";
import { useClosureScenarios, useMapData } from "../hooks/useMapData";
import { NetworkMap } from "../map/NetworkMap";
import { mapFeatureId, mapFeatureName } from "../map/MapSelectionBasket";
import type { ClosureScenario, LayerState, MapFeature, SelectableMapKind } from "../types/map";

interface DraftScenario {
  id?: string;
  name: string;
  area_ids: string[];
  valve_ids: string[];
  updated_at?: string;
}

const scenarioLayers: LayerState = {
  closureAreas: true, pipes: true, valves: true, addresses: false,
  plannedShutdowns: false, activeShutdowns: false, newIncidents: false, activeIncidents: false,
};

const asDraft = (scenario: ClosureScenario): DraftScenario => ({ ...scenario });
const normalized = (draft?: DraftScenario) => draft ? JSON.stringify({ name: draft.name.trim(), area_ids: [...draft.area_ids].sort(), valve_ids: [...draft.valve_ids].sort() }) : "";

export function ClosureScenariosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const map = useMapData();
  const scenarios = useClosureScenarios();
  const { data: settings } = useAppSettings();
  const areas = map.closureAreas.data?.features ?? [];
  const valves = map.valves.data?.features ?? [];
  const [focusedAreaId, setFocusedAreaId] = useState(searchParams.get("area") ?? "");
  const [selectedScenarioId, setSelectedScenarioId] = useState(searchParams.get("scenario") ?? "");
  const selectedScenario = scenarios.query.data?.find((scenario) => scenario.id === selectedScenarioId);
  const [draft, setDraft] = useState<DraftScenario>();
  const [areaSearch, setAreaSearch] = useState("");
  const [valveSearch, setValveSearch] = useState("");
  const dirty = Boolean(draft && (draft.id ? normalized(draft) !== normalized(selectedScenario ? asDraft(selectedScenario) : undefined) : normalized(draft) !== normalized({ name: "", area_ids: focusedAreaId ? [focusedAreaId] : [], valve_ids: [] })));
  const visibleScenarios = (scenarios.query.data ?? []).filter((scenario) => !focusedAreaId || scenario.area_ids.includes(focusedAreaId));
  const focusedArea = areas.find((area) => mapFeatureId(area) === focusedAreaId);
  const valid = Boolean(draft?.name.trim() && draft.area_ids.length && draft.valve_ids.length);
  const mutationError = scenarios.create.error ?? scenarios.update.error ?? scenarios.remove.error;

  const visibleAreas = useMemo(() => areas.filter((area) => {
    const term = areaSearch.trim().toLocaleLowerCase("da");
    return !term || mapFeatureName(area, mapFeatureId(area)).toLocaleLowerCase("da").includes(term);
  }), [areaSearch, areas]);
  const visibleValves = useMemo(() => valves.filter((valve) => {
    const term = valveSearch.trim().toLocaleLowerCase("da");
    return !term || mapFeatureName(valve, mapFeatureId(valve)).toLocaleLowerCase("da").includes(term);
  }), [valveSearch, valves]);

  function allowDiscard() {
    return !dirty || window.confirm("Der er ændringer, som ikke er gemt. Vil du kassere dem?");
  }

  function focusArea(id: string) {
    if (!allowDiscard()) return;
    setFocusedAreaId(id);
    setSelectedScenarioId("");
    setDraft(undefined);
    setSearchParams(id ? { area: id } : {});
  }

  function selectScenario(scenario: ClosureScenario) {
    if (!allowDiscard()) return;
    setSelectedScenarioId(scenario.id);
    setDraft(asDraft(scenario));
    const params: Record<string, string> = { scenario: scenario.id };
    if (focusedAreaId) params.area = focusedAreaId;
    setSearchParams(params);
  }

  function createDraft() {
    if (!allowDiscard()) return;
    setSelectedScenarioId("");
    setDraft({ name: "Nyt lukkescenarie", area_ids: focusedAreaId ? [focusedAreaId] : [], valve_ids: [] });
  }

  function toggle(kind: "area_ids" | "valve_ids", id: string) {
    setDraft((current) => !current ? current : ({
      ...current,
      [kind]: current[kind].includes(id) ? current[kind].filter((value) => value !== id) : [...current[kind], id],
    }));
  }

  function selectMapFeature(feature: MapFeature, kind?: SelectableMapKind) {
    if (kind === "closureArea") focusArea(mapFeatureId(feature));
    if (kind === "valve" && draft) toggle("valve_ids", mapFeatureId(feature));
  }

  async function save() {
    if (!draft || !valid) return;
    const payload = { name: draft.name.trim(), area_ids: draft.area_ids, valve_ids: draft.valve_ids, ...(draft.updated_at && { expected_updated_at: draft.updated_at }) };
    try {
      const saved = draft.id
        ? await scenarios.update.mutateAsync({ id: draft.id, payload })
        : await scenarios.create.mutateAsync(payload);
      setSelectedScenarioId(saved.id);
      setDraft(asDraft(saved));
      setSearchParams({ ...(focusedAreaId && { area: focusedAreaId }), scenario: saved.id });
    } catch { /* Error is shown below. */ }
  }

  async function remove() {
    if (!draft?.id || !window.confirm(`Slet "${draft.name}" fra ${draft.area_ids.length} lukkeområder?`)) return;
    try {
      await scenarios.remove.mutateAsync(draft.id);
      setSelectedScenarioId("");
      setDraft(undefined);
      setSearchParams(focusedAreaId ? { area: focusedAreaId } : {});
    } catch { /* Error is shown below. */ }
  }

  const highlightedAreas = draft?.area_ids ?? (focusedAreaId ? [focusedAreaId] : []);
  return <section className="closure-scenarios-page">
    <header className="closure-scenarios-heading"><div><span className="eyebrow">Netlogik</span><h1>Lukkescenarier</h1><p>Opret én lukkehandling, vælg alle berørte områder, og registrér de haner der skal lukkes samtidig.</p></div><div className="scenario-rule"><strong>Logikken</strong><span>Områder påvirkes samlet. Haner i samme scenarie forbindes med OG; separate scenarier er alternativer.</span></div></header>

    <section className="scenario-workbench" aria-label="Rediger lukkescenarier">
      <div className="scenario-area-picker"><label>Vis scenarier for lukkeområde<select value={focusedAreaId} onChange={(event) => focusArea(event.target.value)}><option value="">Alle lukkescenarier</option>{areas.map((area) => <option key={mapFeatureId(area)} value={mapFeatureId(area)}>{mapFeatureName(area, "Lukkeområde")}</option>)}</select></label><div><strong>{visibleScenarios.length}</strong><span>{focusedArea ? `scenarier påvirker ${mapFeatureName(focusedArea)}` : "lukkescenarier i alt"}</span></div></div>
      {(map.closureAreas.isLoading || scenarios.query.isLoading) && <p className="scenario-page-state">Henter lukkescenarier…</p>}
      {(map.closureAreas.isError || scenarios.query.isError) && <div className="form-error" role="alert">Lukkescenarierne kunne ikke indlæses.</div>}
      {!scenarios.query.isLoading && <div className="scenario-register">
        <aside className="scenario-register__list"><header><div><span className="eyebrow">{focusedArea ? "Områdets scenarier" : "Scenarieregister"}</span><h2>{focusedArea ? mapFeatureName(focusedArea) : "Alle scenarier"}</h2></div><button type="button" onClick={createDraft}>+ Nyt scenarie</button></header>{visibleScenarios.map((scenario, index) => <button type="button" className={scenario.id === selectedScenarioId ? "is-active" : ""} onClick={() => selectScenario(scenario)} key={scenario.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{scenario.name}</strong><small>{scenario.area_ids.length} områder · {scenario.valve_ids.length} haner · alle kræves</small></div></button>)}{!visibleScenarios.length && <p>Ingen scenarier påvirker dette område. Vælg <strong>Nyt scenarie</strong> for at oprette et.</p>}</aside>
        <div className="scenario-register__editor">{draft ? <><header><label>Scenarienavn<input maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>{draft.id && <button type="button" onClick={() => void remove()}>Slet scenarie</button>}</header><div className="scenario-logic"><span>{draft.area_ids.length} områder</span><strong>←</strong><span>{draft.valve_ids.length} haner</span><small>Alle valgte haner skal lukkes, før samtlige valgte områder regnes som berørte.</small></div><div className="scenario-membership-grid"><section><label className="scenario-valve-search">Søg lukkeområde<input value={areaSearch} onChange={(event) => setAreaSearch(event.target.value)} placeholder="Skriv områdenavn" /></label><fieldset><legend>Berørte lukkeområder</legend>{visibleAreas.map((area) => { const id = mapFeatureId(area); return <label key={id}><input type="checkbox" checked={draft.area_ids.includes(id)} onChange={() => toggle("area_ids", id)} /><span><strong>{mapFeatureName(area, id)}</strong><small>{area.properties.active === false ? "Inaktivt område" : "Aktivt område"}</small></span></label>; })}</fieldset></section><section><label className="scenario-valve-search">Søg hane<input value={valveSearch} onChange={(event) => setValveSearch(event.target.value)} placeholder="Skriv hane-ID" /></label><fieldset><legend>Nødvendige haner</legend>{visibleValves.map((valve) => { const id = mapFeatureId(valve); return <label key={id}><input type="checkbox" checked={draft.valve_ids.includes(id)} onChange={() => toggle("valve_ids", id)} /><span><strong>{mapFeatureName(valve, id)}</strong><small>{String(valve.properties.status ?? "Status ikke angivet")}</small></span></label>; })}</fieldset></section></div></> : <div className="scenario-page-empty"><strong>{focusedArea ? `Vælg et scenarie for ${mapFeatureName(focusedArea)}` : "Vælg eller opret et lukkescenarie"}</strong><span>Derefter kan du se og redigere alle berørte områder og nødvendige haner.</span></div>}</div>
        <footer>{mutationError && <span className="field-error">{mutationError instanceof ApiError && mutationError.status === 409 ? "Scenariet er ændret af en anden bruger. Vælg scenariet igen for at hente den nyeste version." : "Scenariet kunne ikke gemmes."}</span>}<span>{draft ? dirty ? "Der er ændringer, som ikke er gemt." : "Alle ændringer er gemt." : "Vælg et scenarie for at redigere."}</span><button className="primary-button" type="button" disabled={!draft || !dirty || !valid || scenarios.create.isPending || scenarios.update.isPending} onClick={() => void save()}>{scenarios.create.isPending || scenarios.update.isPending ? "Gemmer…" : "Gem lukkescenarie"}</button></footer>
      </div>}
    </section>

    <section className="scenario-map-section"><header><div><span className="eyebrow">Live ledningskort</span><h2>Områder og haner i sammenhæng</h2></div><div className="scenario-map-legend"><span><i className="is-area" />Berørte områder</span><span><i className="is-valve" />Nødvendige haner</span></div></header><p>Klik på et lukkeområde for at se alle scenarier, der påvirker det. Når et scenarie redigeres, kan haner tilføjes eller fjernes direkte i kortet.</p><div className="closure-scenarios-map"><NetworkMap closureAreas={map.closureAreas.data} pipes={map.pipes.data} valves={map.valves.data} layers={scenarioLayers} selectedClosureAreaIds={highlightedAreas} selectedValveIds={draft?.valve_ids ?? []} defaultLongitude={settings.map_default_longitude} defaultLatitude={settings.map_default_latitude} defaultZoom={settings.map_default_zoom} onFeatureSelect={selectMapFeature} /></div></section>
  </section>;
}
