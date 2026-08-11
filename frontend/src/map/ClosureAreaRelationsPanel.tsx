import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useClosureAreaRelations } from "../hooks/useMapData";
import type { MapFeature, MapFeatureCollection } from "../types/map";
import { mapFeatureId, mapFeatureName } from "./MapSelectionBasket";

interface Props {
  area: MapFeature;
  valves?: MapFeatureCollection;
  addresses?: MapFeatureCollection;
  onClose: () => void;
  onSaved: () => void;
}

const addressLabel = (feature: MapFeature) => `${feature.properties.street_name ?? ""} ${feature.properties.house_number ?? ""}, ${feature.properties.postal_code ?? ""} ${feature.properties.city ?? ""}`.replace(/\s+/g, " ").trim();

export function ClosureAreaRelationsPanel({ area, addresses, onClose, onSaved }: Props) {
  const areaId = mapFeatureId(area);
  const { query, update } = useClosureAreaRelations(areaId);
  const [addressIds, setAddressIds] = useState<string[]>([]);
  const [addressSearch, setAddressSearch] = useState("");

  useEffect(() => {
    if (!query.data) return;
    setAddressIds(query.data.address_ids);
  }, [query.data]);

  const candidateIds = useMemo(() => new Set(query.data?.candidate_address_ids ?? []), [query.data]);
  const matchingAddresses = addresses?.features.filter((feature) => {
    const id = mapFeatureId(feature);
    const term = addressSearch.trim().toLocaleLowerCase("da");
    return term.length >= 2 ? addressLabel(feature).toLocaleLowerCase("da").includes(term) : candidateIds.has(id) || addressIds.includes(id);
  }) ?? [];
  const visibleAddresses = matchingAddresses.slice(0, 100);
  const changed = query.data ? [...addressIds].sort().join() !== [...query.data.address_ids].sort().join() : false;
  const toggle = (current: string[], id: string, checked: boolean) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id);

  async function save() {
    try {
      await update.mutateAsync({ address_ids: addressIds });
      onSaved();
    } catch { /* Error is shown below. */ }
  }

  return <aside className="relation-editor" aria-label="Rediger lukkeområdets koblinger">
    <header><div><span className="eyebrow">Lukkeområde</span><h2>{mapFeatureName(area, "Lukkeområde")}</h2></div><button type="button" onClick={onClose} aria-label="Luk relationredigering">×</button></header>
    {query.isLoading && <div className="relation-editor__state" role="status"><span className="loader" />Indlæser koblinger…</div>}
    {query.isError && <div className="form-error" role="alert">{query.error.message}<button type="button" onClick={() => query.refetch()}>Prøv igen</button></div>}
    {query.data && <div className="relation-editor__body">
      <section className="scenario-editor"><header><div><strong>Lukkescenarier</strong><span>{query.data.scenarios.length} scenarier</span></div><p>Scenarier og ringforbindelser administreres på deres egen side, hvor hanerne kan kontrolleres direkte i live-kortet.</p></header><div className="relation-editor__tools"><Link className="secondary-button" to={`/lukkescenarier?area=${encodeURIComponent(areaId)}`}>Åbn lukkescenarier</Link></div></section>
      <section><header><div><strong>Adresser</strong><span>{addressIds.length} valgt · {candidateIds.size} i polygonen</span></div><input aria-label="Søg efter adresse til lukkeområde" value={addressSearch} onChange={(event) => setAddressSearch(event.target.value)} placeholder="Søg vejnavn eller husnummer" /></header><div className="relation-editor__tools"><button type="button" onClick={() => setAddressIds((current) => [...new Set([...current, ...candidateIds])])}>Vælg alle i polygonen</button><button type="button" onClick={() => setAddressIds([])}>Fjern alle</button></div><fieldset><legend className="sr-only">Tilknyttede adresser</legend>{visibleAddresses.map((feature) => { const id = mapFeatureId(feature); return <label key={id}><input type="checkbox" checked={addressIds.includes(id)} onChange={(event) => setAddressIds((current) => toggle(current, id, event.target.checked))} /><span><strong>{addressLabel(feature)}</strong><small>{candidateIds.has(id) ? "Punkt i polygonen" : "Manuelt fundet"}</small></span></label>; })}{!visibleAddresses.length && <p>{addressSearch.trim().length < 2 ? "Ingen adressepunkter i polygonen." : "Ingen adresser matcher søgningen."}</p>}</fieldset>{matchingAddresses.length > 100 && <p className="relation-editor__limit">Viser de første 100. Brug søgning for at finde en bestemt adresse.</p>}</section>
    </div>}
    {update.isError && <div className="form-error" role="alert">{update.error.message}</div>}
    {query.data && <footer><button className="secondary-button" type="button" onClick={onClose}>Annuller</button><button className="primary-button" type="button" disabled={!changed || update.isPending} onClick={() => void save()}>{update.isPending ? "Gemmer…" : "Gem adresser"}</button></footer>}
  </aside>;
}
