import { Link } from "react-router-dom";
import { canMutateIncidents } from "../types/incidents";
import type { MapFeature, SelectedMapItem } from "../types/map";
import { canMutateShutdowns } from "../types/plannedShutdowns";

interface Props {
  items: SelectedMapItem[];
  roles?: string[];
  onRemove: (item: SelectedMapItem) => void;
  onClear: () => void;
  onEditRelations?: (item: SelectedMapItem) => void;
}

export const mapFeatureId = (feature: MapFeature) => String(feature.properties.id ?? feature.id ?? "");

export function mapFeatureName(feature: MapFeature, fallback = "Kortobjekt") {
  return String(feature.properties.name ?? feature.properties.label ?? feature.properties.code ?? fallback);
}

export function selectedValveIds(items: SelectedMapItem[]) {
  const ids = new Set<string>();
  items.forEach((item) => {
    if (item.kind === "valve") ids.add(item.id);
  });
  return [...ids].filter(Boolean);
}

function coordinates(feature: MapFeature): number[][] {
  const points: number[][] = [];
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") points.push([value[0], value[1]]);
    else value.forEach(visit);
  };
  if (feature.geometry && "coordinates" in feature.geometry) visit(feature.geometry.coordinates);
  return points;
}

export function selectedCenter(item?: SelectedMapItem) {
  if (!item) return undefined;
  const points = coordinates(item.feature);
  if (!points.length) return undefined;
  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);
  return { longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2, latitude: (Math.min(...lats) + Math.max(...lats)) / 2 };
}

export function MapSelectionBasket({ items, roles, onRemove, onClear, onEditRelations }: Props) {
  if (!items.length) return null;
  const valves = items.filter((item) => item.kind === "valve").length;
  const areas = items.length - valves;
  const valveIds = selectedValveIds(items);
  const center = selectedCenter(items[0]);
  const place = mapFeatureName(items[0].feature);
  const selectedArea = items.find((item) => item.kind === "closureArea");
  const canEditRelations = roles?.some((role) => role === "admin" || role === "map_manager") ?? false;
  const shutdownParams = new URLSearchParams({ source: "map" });
  valveIds.forEach((id) => shutdownParams.append("valve_ids", id));
  const incidentParams = new URLSearchParams({ lng: String(center?.longitude), lat: String(center?.latitude), place, source: "map" });

  return <aside className="map-selection-basket" aria-label="Valgt i kortet">
    <header><div><span className="eyebrow">Arbejdskurv</span><h2>Valgt i kortet</h2></div><button type="button" onClick={onClear}>Ryd alle</button></header>
    <p className="map-selection-count">{items.length} valgt · {valves} {valves === 1 ? "hane" : "haner"} · {areas} {areas === 1 ? "område" : "områder"}</p>
    <ul>{items.map((item) => <li key={`${item.kind}-${item.id}`}><span><i className={`map-selection-kind map-selection-kind--${item.kind}`} /><strong>{mapFeatureName(item.feature, item.kind === "valve" ? "Hane" : "Lukkeområde")}</strong><small>{item.kind === "valve" ? "Hane" : "Lukkeområde"}</small></span><button type="button" aria-label={`Fjern ${mapFeatureName(item.feature)}`} onClick={() => onRemove(item)}>Fjern</button></li>)}</ul>
    <div className="map-selection-actions">
      {canEditRelations && areas === 1 && selectedArea && onEditRelations && <button className="secondary-button" type="button" onClick={() => onEditRelations(selectedArea)}>Rediger koblinger</button>}
      {canMutateShutdowns(roles) && (valveIds.length ? <Link className="primary-button" to={`/vandlukninger/ny?${shutdownParams}`}>Opret vandlukning</Link> : <><button className="primary-button" type="button" disabled>Opret vandlukning</button><small>De valgte områder har ingen tilknyttede haner.</small></>)}
      {canMutateIncidents(roles) && center && <Link className="secondary-button" to={`/haendelser/ny?${incidentParams}`}>Opret hændelse</Link>}
    </div>
  </aside>;
}
