import { useState } from "react";
import { useMapData } from "../hooks/useMapData";
import { LayerControls } from "../map/LayerControls";
import { MapSearch } from "../map/MapSearch";
import { NetworkMap } from "../map/NetworkMap";
import { mapFeatureId, MapSelectionBasket } from "../map/MapSelectionBasket";
import { SelectionPanel } from "../map/SelectionPanel";
import { useCurrentUser } from "../hooks/useAuth";
import { ClosureAreaRelationsPanel } from "../map/ClosureAreaRelationsPanel";
import type { LayerState, MapFeature, MapLayerId, MapSearchResult, MapSelection, SelectedMapItem, SelectableMapKind } from "../types/map";
import { useAppSettings } from "../hooks/useAppSettings";
import { useDashboardMap } from "../hooks/useDashboardMap";

const initialLayers: LayerState = { closureAreas: true, mainPipes: true, distributionPipes: true, servicePipes: true, valves: true, addresses: true, plannedShutdowns: true, activeShutdowns: true, newIncidents: true, activeIncidents: true };

export function MapPage() {
  const data = useMapData();
  const { data: user } = useCurrentUser();
  const { data: appSettings } = useAppSettings();
  const operations = useDashboardMap();
  const [layers, setLayers] = useState(initialLayers);
  const [selection, setSelection] = useState<MapSelection>();
  const [focus, setFocus] = useState<MapSearchResult>();
  const [selectedItems, setSelectedItems] = useState<SelectedMapItem[]>([]);
  const [relationArea, setRelationArea] = useState<SelectedMapItem>();
  const queries = Object.values(data);
  const loading = queries.some((query) => query.isLoading);
  const hasError = queries.some((query) => query.isError);
  const totalFeatures = queries.reduce((total, query) => total + (query.data?.features.length ?? 0), 0);
  const counts = {
    addresses: data.addresses.data?.features.length,
    valves: data.valves.data?.features.length,
    mainPipes: data.pipes.data?.features.filter((feature) => feature.properties.pipe_type === "main").length,
    distributionPipes: data.pipes.data?.features.filter((feature) => feature.properties.pipe_type === "distribution").length,
    servicePipes: data.pipes.data?.features.filter((feature) => feature.properties.pipe_type === "service").length,
    closureAreas: data.closureAreas.data?.features.length,
    plannedShutdowns: operations.data?.features.filter((feature) => feature.properties.kind === "shutdown" && feature.properties.status === "planned").length,
    activeShutdowns: operations.data?.features.filter((feature) => feature.properties.kind === "shutdown" && feature.properties.status === "in_progress").length,
    newIncidents: operations.data?.features.filter((feature) => feature.properties.kind === "incident" && feature.properties.status === "new").length,
    activeIncidents: operations.data?.features.filter((feature) => feature.properties.kind === "incident" && feature.properties.status === "active").length,
  };

  function toggleLayer(id: MapLayerId, visible: boolean) {
    setLayers((current) => ({ ...current, [id]: visible }));
  }

  function selectResult(result: MapSearchResult) {
    setFocus(result);
    setSelection({ kind: "search", result });
  }

  function selectFeature(feature: MapFeature, kind?: SelectableMapKind) {
    if (!kind) {
      setSelection({ kind: "feature", feature });
      return;
    }
    const id = mapFeatureId(feature);
    if (!id) return;
    setSelection(undefined);
    setSelectedItems((current) => current.some((item) => item.kind === kind && item.id === id) ? current.filter((item) => item.kind !== kind || item.id !== id) : [...current, { id, kind, feature }]);
  }

  return <section className="map-page">
    <header className="map-page__heading">
      <div><span className="eyebrow">Fase 2 · Grunddata</span><h1>Ledningskort</h1></div>
      <span className="map-live"><i /> Live kortdata</span>
    </header>
    <div className="map-workspace">
      <aside className="map-sidebar" aria-label="Kortværktøjer">
        <MapSearch onSelect={selectResult} />
        <LayerControls value={layers} counts={counts} onChange={toggleLayer} />
        {operations.isError && <p className="map-operations-state" role="alert">Driftslag kunne ikke indlæses.</p>}
        <div className="map-legend" aria-label="Signaturforklaring">
          <strong>Signatur</strong>
          <span><i className="legend-main" />Hovedforsyningsledning</span>
          <span><i className="legend-distribution" />Fordelingsledning</span>
          <span><i className="legend-service" />Stikledning</span>
          <span><i className="legend-valve" />Hane</span>
          <span><i className="legend-address" />Adresse</span>
        </div>
      </aside>
      <div className="map-stage">
        <NetworkMap
          addresses={data.addresses.data}
          valves={data.valves.data}
          pipes={data.pipes.data}
          closureAreas={data.closureAreas.data}
          operations={operations.data}
          layers={layers}
          focus={focus}
          selectedValveIds={selectedItems.filter((item) => item.kind === "valve").map((item) => item.id)}
          selectedClosureAreaIds={selectedItems.filter((item) => item.kind === "closureArea").map((item) => item.id)}
          defaultLongitude={appSettings.map_default_longitude}
          defaultLatitude={appSettings.map_default_latitude}
          defaultZoom={appSettings.map_default_zoom}
          onFeatureSelect={selectFeature}
        />
        {loading && <div className="map-notice" role="status"><span className="loader" />Indlæser kortdata…</div>}
        {!loading && hasError && <div className="map-notice map-notice--error" role="alert"><strong>Kortdata kunne ikke indlæses</strong><span>Kontrollér forbindelsen, og prøv igen.</span><button type="button" onClick={() => queries.forEach((query) => query.refetch())}>Prøv igen</button></div>}
        {!loading && !hasError && totalFeatures === 0 && <div className="map-notice" role="status"><strong>Ingen grunddata endnu</strong><span>Baggrundskortet er klar, men der er ingen objekter at vise.</span></div>}
        {selection && <SelectionPanel selection={selection} onClose={() => setSelection(undefined)} />}
        {relationArea ? <ClosureAreaRelationsPanel area={relationArea.feature} valves={data.valves.data} addresses={data.addresses.data} onClose={() => setRelationArea(undefined)} onSaved={() => { setRelationArea(undefined); setSelectedItems([]); }} /> : <MapSelectionBasket items={selectedItems} roles={user?.roles} onRemove={(removed) => setSelectedItems((current) => current.filter((item) => item !== removed))} onClear={() => setSelectedItems([])} onEditRelations={setRelationArea} />}
      </div>
    </div>
  </section>;
}
