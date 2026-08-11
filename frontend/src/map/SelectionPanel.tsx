import type { MapSelection } from "../types/map";

interface Props { selection: MapSelection; onClose: () => void }

const labels: Record<string, string> = {
  code: "ID", name: "Navn", label: "Betegnelse", pipe_type: "Ledningstype", material: "Materiale",
  diameter_mm: "Diameter (mm)", installation_year: "Anlægsår", status: "Status", valve_type: "Hanetype",
  current_position: "Aktuel position", street_name: "Vej", house_number: "Husnr.", postal_code: "Postnr.", city: "By",
  description: "Beskrivelse", confidence: "Sikkerhed", active: "Aktiv",
};

export function SelectionPanel({ selection, onClose }: Props) {
  const title = selection.kind === "search" ? selection.result.label : String(selection.feature.properties?.label ?? selection.feature.properties?.name ?? selection.feature.properties?.code ?? "Kortobjekt");
  const subtitle = selection.kind === "search" ? selection.result.subtitle : geometryLabel(selection.feature.geometry.type);
  const properties = selection.kind === "feature" ? Object.entries(selection.feature.properties ?? {}).filter(([key, value]) => value !== null && value !== undefined && key !== "id") : [];

  return <aside className="selection-panel" aria-label={`Detaljer for ${title}`}>
    <button type="button" className="selection-panel__close" onClick={onClose} aria-label="Luk detaljer">×</button>
    <span className="eyebrow">Valgt i kortet</span>
    <h2>{title}</h2>
    <p>{subtitle}</p>
    {selection.kind === "search" && <dl><div><dt>Type</dt><dd>{selection.result.type}</dd></div><div><dt>ID</dt><dd>{selection.result.id}</dd></div></dl>}
    {selection.kind === "feature" && <dl>{properties.map(([key, value]) => <div key={key}><dt>{labels[key] ?? key.replaceAll("_", " ")}</dt><dd>{typeof value === "boolean" ? (value ? "Ja" : "Nej") : String(value)}</dd></div>)}</dl>}
  </aside>;
}

function geometryLabel(type: string) {
  if (type.includes("Point")) return "Punktobjekt";
  if (type.includes("Line")) return "Ledningsobjekt";
  if (type.includes("Polygon")) return "Områdeobjekt";
  return "Kortobjekt";
}
