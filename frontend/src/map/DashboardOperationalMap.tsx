import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import type { MapFeatureCollection } from "../types/map";
import { openOperationalPopup, operationalLayers } from "./operationalLayers";

maplibregl.setWorkerUrl(__MAPLIBRE_WORKER_URL__);

const style: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["/tiles/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap-bidragsydere" } },
  layers: [{ id: "osm", type: "raster", source: "osm", minzoom: 0, maxzoom: 19 }],
};

interface Props {
  data: MapFeatureCollection;
  defaultLongitude: number;
  defaultLatitude: number;
  defaultZoom: number;
}

export function DashboardOperationalMap({ data, defaultLongitude, defaultLatitude, defaultZoom }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    try {
      const instance = new maplibregl.Map({ container: container.current, style, center: [defaultLongitude, defaultLatitude], zoom: defaultZoom, attributionControl: false });
      map.current = instance;
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      instance.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      instance.on("load", () => {
        instance.addSource("operations", { type: "geojson", data });
        operationalLayers.forEach((layer) => instance.addLayer(layer));
        operationalLayers.forEach((layer) => {
          instance.on("click", layer.id, (event) => openOperationalPopup(event, instance));
          instance.on("mouseenter", layer.id, () => { instance.getCanvas().style.cursor = "pointer"; });
          instance.on("mouseleave", layer.id, () => { instance.getCanvas().style.cursor = ""; });
        });
      });
      return () => { instance.remove(); map.current = undefined; };
    } catch {
      setError(true);
    }
  }, [defaultLatitude, defaultLongitude, defaultZoom]);

  useEffect(() => {
    const source = map.current?.getSource("operations") as GeoJSONSource | undefined;
    source?.setData(data);
  }, [data]);

  return <div className="dashboard-operational-map">{error && <p>Kortet kunne ikke indlæses.</p>}<div ref={container} className="dashboard-operational-map__canvas" /></div>;
}
