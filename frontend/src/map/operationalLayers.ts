import * as maplibregl from "maplibre-gl";
import type { CircleLayerSpecification, MapLayerMouseEvent } from "maplibre-gl";

export const operationalLayers: CircleLayerSpecification[] = [
  { id: "planned-shutdowns", type: "circle", source: "operations", filter: ["all", ["==", ["get", "kind"], "shutdown"], ["==", ["get", "status"], "planned"]], paint: { "circle-radius": 8, "circle-color": "#f4b942", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
  { id: "active-shutdowns", type: "circle", source: "operations", filter: ["all", ["==", ["get", "kind"], "shutdown"], ["==", ["get", "status"], "in_progress"]], paint: { "circle-radius": 10, "circle-color": "#ff6e65", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } },
  { id: "new-incidents", type: "circle", source: "operations", filter: ["all", ["==", ["get", "kind"], "incident"], ["==", ["get", "status"], "new"]], paint: { "circle-radius": 8, "circle-color": "#9b7cff", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
  { id: "active-incidents", type: "circle", source: "operations", filter: ["all", ["==", ["get", "kind"], "incident"], ["==", ["get", "status"], "active"]], paint: { "circle-radius": 10, "circle-color": "#d84f4a", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } },
];

export const operationalLayerIds = operationalLayers.map((layer) => layer.id);

export function openOperationalPopup(event: MapLayerMouseEvent, map: maplibregl.Map) {
  const feature = event.features?.[0];
  const coordinates = feature?.geometry.type === "Point" ? feature.geometry.coordinates : undefined;
  if (!feature || !coordinates) return;
  const content = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = String(feature.properties?.title ?? "Driftssag");
  const link = document.createElement("a");
  link.href = String(feature.properties?.url ?? "/");
  link.textContent = "Åbn sag →";
  content.append(title, link);
  new maplibregl.Popup({ closeButton: false, offset: 12 }).setLngLat(coordinates as [number, number]).setDOMContent(content).addTo(map);
}
