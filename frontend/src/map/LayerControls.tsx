import type { LayerState, MapLayerId } from "../types/map";

const layers: { id: MapLayerId; label: string; detail: string }[] = [
  { id: "closureAreas", label: "Lukkeområder", detail: "Forsyningszoner" },
  { id: "mainPipes", label: "Hovedledninger", detail: "Hovedforsyningsledninger" },
  { id: "distributionPipes", label: "Fordelingsledninger", detail: "Forgreninger til flere ejendomme" },
  { id: "servicePipes", label: "Stikledninger", detail: "Tilslutninger til enkelte ejendomme" },
  { id: "valves", label: "Haner", detail: "Afspærringshaner" },
  { id: "addresses", label: "Adresser", detail: "Forsyningspunkter" },
  { id: "plannedShutdowns", label: "Planlagte vandlukninger", detail: "Godkendt kommende arbejde" },
  { id: "activeShutdowns", label: "Aktive vandlukninger", detail: "Igangværende lukninger" },
  { id: "newIncidents", label: "Nye hændelser", detail: "Afventer behandling" },
  { id: "activeIncidents", label: "Aktive hændelser", detail: "Under behandling" },
];

interface Props {
  value: LayerState;
  counts: Partial<Record<MapLayerId, number>>;
  onChange: (id: MapLayerId, visible: boolean) => void;
}

export function LayerControls({ value, counts, onChange }: Props) {
  return <fieldset className="layer-controls">
    <legend>Kortlag</legend>
    {layers.map((layer) => <label className="layer-toggle" key={layer.id}>
      <input type="checkbox" checked={value[layer.id]} onChange={(event) => onChange(layer.id, event.target.checked)} />
      <span className={`layer-swatch layer-swatch--${layer.id}`} />
      <span className="layer-toggle__text"><strong>{layer.label}</strong><small>{layer.detail}</small></span>
      {counts[layer.id] !== undefined && <span className="layer-count">{counts[layer.id]}</span>}
      <span className="switch" aria-hidden="true" />
    </label>)}
  </fieldset>;
}
