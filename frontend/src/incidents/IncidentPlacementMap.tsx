import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { MapFeatureCollection } from "../types/map";

maplibregl.setWorkerUrl(__MAPLIBRE_WORKER_URL__);

interface Props {
  longitude?: number;
  latitude?: number;
  defaultLongitude?: number;
  defaultLatitude?: number;
  defaultZoom?: number;
  zoom?: number;
  pipes?: MapFeatureCollection;
  valves?: MapFeatureCollection;
  onChange: (longitude: number, latitude: number) => void;
  onZoomChange?: (zoom: number) => void;
}

const style: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["/tiles/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap-bidragsydere" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function IncidentPlacementMap({ longitude, latitude, defaultLongitude = 11.45, defaultLatitude = 55.62, defaultZoom = 13, zoom, pipes, valves, onChange, onZoomChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map>();
  const marker = useRef<maplibregl.Marker>();
  const change = useRef(onChange);
  const changeZoom = useRef(onZoomChange);
  const [failed, setFailed] = useState(false);
  change.current = onChange;
  changeZoom.current = onZoomChange;

  useEffect(() => {
    if (!container.current) return;
    try {
      const instance = new maplibregl.Map({
        container: container.current,
        style,
        center: [longitude ?? defaultLongitude, latitude ?? defaultLatitude],
        zoom: zoom ?? (longitude == null ? defaultZoom : 16),
        attributionControl: false,
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: false },
      });
      map.current = instance;
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      instance.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      instance.on("error", (event) => {
        if (/worker|module script|webgl|initialize/i.test(event.error?.message ?? "")) setFailed(true);
      });
      instance.on("load", () => {
        if (pipes) {
          instance.addSource("incident-pipes", { type: "geojson", data: pipes });
          instance.addLayer({ id: "incident-pipes", type: "line", source: "incident-pipes", paint: { "line-color": "#1d8cff", "line-width": 3 } });
        }
        if (valves) {
          instance.addSource("incident-valves", { type: "geojson", data: valves });
          instance.addLayer({ id: "incident-valves", type: "circle", source: "incident-valves", paint: { "circle-radius": 5, "circle-color": "#efb95a", "circle-stroke-width": 2, "circle-stroke-color": "#4a3100" } });
        }
        window.requestAnimationFrame(() => { try { instance.resize(); } catch { /* ignore */ } });
      });
      instance.on("click", (event) => change.current(event.lngLat.lng, event.lngLat.lat));
      instance.on("zoomend", () => changeZoom.current?.(instance.getZoom()));
      const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { try { instance.resize(); } catch { /* ignore */ } }) : null;
      if (resizeObserver && container.current) resizeObserver.observe(container.current);
      return () => { marker.current?.remove(); resizeObserver?.disconnect(); instance.remove(); };
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!map.current || longitude == null || latitude == null) return;
    if (!marker.current) marker.current = new maplibregl.Marker({ color: "#ff6e65" }).setLngLat([longitude, latitude]).addTo(map.current);
    else marker.current.setLngLat([longitude, latitude]);
  }, [longitude, latitude]);

  useEffect(() => {
    if (!map.current || longitude != null || latitude != null) return;
    map.current.jumpTo({ center: [defaultLongitude, defaultLatitude], zoom: defaultZoom });
  }, [defaultLongitude, defaultLatitude, defaultZoom, longitude, latitude]);

  useEffect(() => {
    if (!map.current || zoom == null) return;
    map.current.jumpTo({ center: [longitude ?? defaultLongitude, latitude ?? defaultLatitude], zoom });
  }, [defaultLatitude, defaultLongitude, latitude, longitude, zoom]);

  return <div className="incident-placement-map"><div ref={container} className="incident-placement-map__canvas" aria-label="Kort til placering af hændelsen" />{failed && <div className="map-render-error" role="alert">Kortet kunne ikke vises. Indtast koordinaterne nedenfor.</div>}<span className="incident-map-hint">Klik i kortet for at placere hændelsen</span></div>;
}
