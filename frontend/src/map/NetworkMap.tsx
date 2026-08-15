import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import type { LayerState, MapFeature, MapFeatureCollection, MapSearchResult, SelectableMapKind } from "../types/map";
import { openOperationalPopup, operationalLayerIds, operationalLayers } from "./operationalLayers";

interface Props {
  addresses?: MapFeatureCollection;
  valves?: MapFeatureCollection;
  pipes?: MapFeatureCollection;
  closureAreas?: MapFeatureCollection;
  operations?: MapFeatureCollection;
  layers: LayerState;
  focus?: MapSearchResult;
  selectedValveIds?: string[];
  selectedClosureAreaIds?: string[];
  defaultLongitude?: number;
  defaultLatitude?: number;
  defaultZoom?: number;
  onFeatureSelect: (feature: MapFeature, selectableKind?: SelectableMapKind) => void;
}

const emptyCollection: MapFeatureCollection = { type: "FeatureCollection", features: [] };
maplibregl.setWorkerUrl(__MAPLIBRE_WORKER_URL__);
const sourceIds = ["closure-areas", "pipes", "valves", "addresses", "operations"] as const;
const layerGroups: Record<keyof LayerState, string[]> = {
  closureAreas: ["closure-fill", "closure-outline", "selected-closure-fill", "selected-closure-outline"],
  mainPipes: ["main-pipes"],
  distributionPipes: ["distribution-pipes"],
  servicePipes: ["service-pipes"],
  mainValves: ["main-valves", "selected-main-valves"],
  distributionValves: ["distribution-valves", "selected-distribution-valves"],
  serviceValves: ["service-valves", "selected-service-valves"],
  uncategorizedValves: ["uncategorized-valves", "selected-uncategorized-valves"],
  addresses: ["addresses"],
  plannedShutdowns: ["planned-shutdowns"],
  activeShutdowns: ["active-shutdowns"],
  newIncidents: ["new-incidents"],
  activeIncidents: ["active-incidents"],
};

const baseStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["/tiles/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap-bidragsydere",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm", minzoom: 0, maxzoom: 19 }],
};

const selectedFilter = (ids: string[]) => ["in", ["to-string", ["coalesce", ["get", "id"], ["id"]]], ["literal", ids]] as maplibregl.FilterSpecification;
const valveLevels = ["main", "distribution", "service"];
const valveLayerIds = ["main-valves", "distribution-valves", "service-valves", "uncategorized-valves"];
const valveLevelFilter = (level?: string) => (level
  ? ["==", ["get", "network_level"], level]
  : ["match", ["get", "network_level"], valveLevels, false, true]) as unknown as maplibregl.FilterSpecification;
const selectedValveFilter = (ids: string[], level?: string) => ["all", selectedFilter(ids), valveLevelFilter(level)] as unknown as maplibregl.FilterSpecification;

export function NetworkMap({ addresses, valves, pipes, closureAreas, operations, layers, focus, selectedValveIds = [], selectedClosureAreaIds = [], defaultLongitude = 11.45, defaultLatitude = 55.62, defaultZoom = 13, onFeatureSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map>();
  const readyRef = useRef(false);
  const [mapError, setMapError] = useState<string>();
  const [mapReady, setMapReady] = useState(false);
  const selectRef = useRef(onFeatureSelect);
  selectRef.current = onFeatureSelect;

  useEffect(() => {
    if (!containerRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: baseStyle,
        center: [defaultLongitude, defaultLatitude],
        zoom: defaultZoom,
        attributionControl: false,
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: false },
      });
    } catch {
      setMapError("Browseren kunne ikke initialisere WebGL-kortet.");
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
    map.on("error", (event) => {
      const message = event.error?.message ?? "";
      if (!readyRef.current && /worker|module script|webgl|initialize/i.test(message)) {
        setMapError(message || "Kortmotoren kunne ikke initialiseres.");
      }
    });

    map.on("load", () => {
      try {
        map.addSource("closure-areas", { type: "geojson", data: closureAreas ?? emptyCollection });
        map.addSource("pipes", { type: "geojson", data: pipes ?? emptyCollection });
        map.addSource("valves", { type: "geojson", data: valves ?? emptyCollection });
        map.addSource("addresses", { type: "geojson", data: addresses ?? emptyCollection });
        map.addSource("operations", { type: "geojson", data: operations ?? emptyCollection });

        map.addLayer({ id: "closure-fill", type: "fill", source: "closure-areas", paint: { "fill-color": "#a78bfa", "fill-opacity": 0.2 } });
        map.addLayer({ id: "closure-outline", type: "line", source: "closure-areas", paint: { "line-color": "#c4b5fd", "line-width": 2, "line-dasharray": [3, 2] } });
        map.addLayer({ id: "selected-closure-fill", type: "fill", source: "closure-areas", filter: selectedFilter(selectedClosureAreaIds), paint: { "fill-color": "#ff6e65", "fill-opacity": 0.38 } });
        map.addLayer({ id: "selected-closure-outline", type: "line", source: "closure-areas", filter: selectedFilter(selectedClosureAreaIds), paint: { "line-color": "#ff3f35", "line-width": 4 } });
        map.addLayer({ id: "service-pipes", type: "line", source: "pipes", filter: ["==", ["get", "pipe_type"], "service"], paint: { "line-color": "#54d5c6", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.4, 17, 3], "line-dasharray": [2, 1.5] } });
        map.addLayer({ id: "distribution-pipes", type: "line", source: "pipes", filter: ["==", ["get", "pipe_type"], "distribution"], paint: { "line-color": "#f59e0b", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.9, 17, 4] } });
        map.addLayer({ id: "main-pipes", type: "line", source: "pipes", filter: ["==", ["get", "pipe_type"], "main"], paint: { "line-color": "#1d8cff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.8, 17, 6] } });
        map.addLayer({ id: "addresses", type: "circle", source: "addresses", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 17, 5], "circle-color": "#f4f8f7", "circle-stroke-color": "#16645e", "circle-stroke-width": 1.5 } });
        map.addLayer({ id: "main-valves", type: "circle", source: "valves", filter: valveLevelFilter("main"), paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 17, 8], "circle-color": "#1d8cff", "circle-stroke-color": "#083c73", "circle-stroke-width": 2 } });
        map.addLayer({ id: "distribution-valves", type: "circle", source: "valves", filter: valveLevelFilter("distribution"), paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 17, 8], "circle-color": "#f59e0b", "circle-stroke-color": "#6b4100", "circle-stroke-width": 2 } });
        map.addLayer({ id: "service-valves", type: "circle", source: "valves", filter: valveLevelFilter("service"), paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 17, 8], "circle-color": "#54d5c6", "circle-stroke-color": "#16645e", "circle-stroke-width": 2 } });
        map.addLayer({ id: "uncategorized-valves", type: "circle", source: "valves", filter: valveLevelFilter(), paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 17, 8], "circle-color": "#f4b942", "circle-stroke-color": "#4a3100", "circle-stroke-width": 2 } });
        for (const [id, level] of [["selected-main-valves", "main"], ["selected-distribution-valves", "distribution"], ["selected-service-valves", "service"], ["selected-uncategorized-valves", undefined]] as const) {
          map.addLayer({ id, type: "circle", source: "valves", filter: selectedValveFilter(selectedValveIds, level), paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 7, 17, 12], "circle-color": "#ff6e65", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
        }
        operationalLayers.forEach((layer) => map.addLayer(layer));

        Object.entries(layerGroups).forEach(([group, ids]) => ids.forEach((id) => map.setLayoutProperty(id, "visibility", layers[group as keyof LayerState] ? "visible" : "none")));
        const clickableLayers = ["closure-fill", "service-pipes", "distribution-pipes", "main-pipes", ...valveLayerIds, "addresses"];
        const selectFeature = (event: MapLayerMouseEvent) => {
          const visibleOperationalLayers = operationalLayerIds.filter((id) => map.getLayer(id));
          if (visibleOperationalLayers.length && map.queryRenderedFeatures(event.point, { layers: visibleOperationalLayers }).length) return;
          const feature = event.features?.[0];
          const layerId = event.features?.[0]?.layer.id;
          if (feature) selectRef.current(feature as unknown as MapFeature, event.type === "click" && layerId && valveLayerIds.includes(layerId) ? "valve" : layerId === "closure-fill" ? "closureArea" : undefined);
        };
        clickableLayers.forEach((id) => {
          map.on("click", id, selectFeature);
          map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
        });
        operationalLayerIds.forEach((id) => {
          map.on("click", id, (event) => openOperationalPopup(event, map));
          map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
        });
        readyRef.current = true;
        setMapReady(true);
        window.requestAnimationFrame(() => { try { map.resize(); } catch { /* ignore */ } });
      } catch (error) {
        setMapError(error instanceof Error ? error.message : "Kortlagene kunne ikke initialiseres.");
      }
    });
    map.on("webglcontextlost", () => {
      setMapError("Browserens WebGL-kontekst blev lukket. Genindlæs siden for at vise kortet.");
    });
    map.on("webglcontextrestored", () => {
      try { map.resize(); } catch { /* ignore */ }
    });
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { try { map.resize(); } catch { /* ignore */ } }) : null;
    if (resizeObserver && containerRef.current) resizeObserver.observe(containerRef.current);
    return () => { readyRef.current = false; resizeObserver?.disconnect(); map.remove(); mapRef.current = undefined; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const data = { "closure-areas": closureAreas, pipes, valves, addresses, operations };
    sourceIds.forEach((id) => {
      const source = map.getSource(id) as GeoJSONSource | undefined;
      if (source && data[id]) source.setData(data[id]!);
    });
  }, [addresses, closureAreas, operations, pipes, valves]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.entries(layerGroups).forEach(([group, ids]) => ids.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", layers[group as keyof LayerState] ? "visible" : "none");
    }));
  }, [layers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, level] of [["selected-main-valves", "main"], ["selected-distribution-valves", "distribution"], ["selected-service-valves", "service"], ["selected-uncategorized-valves", undefined]] as const) {
      if (map.getLayer(id)) map.setFilter(id, selectedValveFilter(selectedValveIds, level));
    }
    if (map.getLayer("selected-closure-fill")) map.setFilter("selected-closure-fill", selectedFilter(selectedClosureAreaIds));
    if (map.getLayer("selected-closure-outline")) map.setFilter("selected-closure-outline", selectedFilter(selectedClosureAreaIds));
  }, [selectedClosureAreaIds, selectedValveIds]);

  useEffect(() => {
    if (focus) mapRef.current?.flyTo({ center: [focus.longitude, focus.latitude], zoom: 17, essential: true });
  }, [focus]);

  useEffect(() => {
    if (focus || !mapRef.current) return;
    mapRef.current.jumpTo({ center: [defaultLongitude, defaultLatitude], zoom: defaultZoom });
  }, [defaultLatitude, defaultLongitude, defaultZoom, focus]);

  return <div className="network-map-shell">
    <div ref={containerRef} className="network-map" aria-label="Interaktivt kort over ledningsnettet" />
    {!mapReady && !mapError && <div className="map-initializing" role="status"><span className="loader" />Initialiserer kort…</div>}
    {mapError && <div className="map-render-error" role="alert"><strong>Kortet kunne ikke vises</strong><span>{mapError}</span></div>}
  </div>;
}
