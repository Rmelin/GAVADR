import { useEffect, useRef, useState } from "react";
import { useMapSearch } from "../hooks/useMapData";
import type { MapSearchResult } from "../types/map";

interface Props { onSelect: (result: MapSearchResult) => void }

const typeLabels: Record<string, string> = { address: "Adresse", street: "Vej", valve: "Hane", pipe: "Ledning" };

export function MapSearch({ onSelect }: Props) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const search = useMapSearch(query);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const showResults = open && input.trim().length >= 2;
  return <div className="map-search" ref={rootRef}>
    <span className="map-search__icon" aria-hidden="true">⌕</span>
    <label className="sr-only" htmlFor="map-search-input">Søg i kortet</label>
    <input
      id="map-search-input"
      type="search"
      value={input}
      autoComplete="off"
      placeholder="Søg adresse, vej, hane eller ledning…"
      aria-expanded={showResults}
      aria-controls="map-search-results"
      onFocus={() => setOpen(true)}
      onChange={(event) => { setInput(event.target.value); setOpen(true); }}
    />
    {search.isFetching && <span className="map-search__spinner" aria-label="Søger" />}
    {showResults && <div id="map-search-results" className="search-results" role="listbox">
      {query.length < 2 && <p>Indtast mindst 2 tegn.</p>}
      {search.isError && <p className="search-results__error">Søgningen kunne ikke gennemføres.</p>}
      {search.isSuccess && search.data.length === 0 && <p>Ingen resultater fundet.</p>}
      {search.data?.map((result) => <button key={`${result.type}-${result.id}`} type="button" role="option" aria-selected="false" onClick={() => { onSelect(result); setInput(result.label); setOpen(false); }}>
        <span className={`result-icon result-icon--${result.type}`} aria-hidden="true" />
        <span><strong>{result.label}</strong><small>{result.subtitle}</small></span>
        <em>{typeLabels[result.type] ?? result.type}</em>
      </button>)}
    </div>}
  </div>;
}
