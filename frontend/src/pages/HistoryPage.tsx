import { useDeferredValue } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarIcon, DownloadIcon, ToolIcon } from "../components/Icons";
import { historyCsvUrl } from "../api/history";
import { useHistory } from "../hooks/useHistory";
import { historyCategoryLabels, type HistoryCategory, type HistoryFilters } from "../types/history";
import { statusLabels } from "../types/incidents";
import { shutdownStatusLabels } from "../types/plannedShutdowns";
import { MultiSelectButtonGroup } from "../components/MultiSelectButtonGroup";

const pageSize = 25;

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDates() {
  const today = new Date();
  return { from: localDate(new Date(today.getFullYear(), 0, 1)), to: localDate(today) };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status: string) {
  return statusLabels[status as keyof typeof statusLabels]
    ?? shutdownStatusLabels[status as keyof typeof shutdownStatusLabels]
    ?? status;
}

function locationSummary(locations: string[]) {
  if (!locations.length) return "Sted ikke angivet";
  return locations.length === 1 ? locations[0] : `${locations[0]} og ${locations.length - 1} flere`;
}

export function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaults = defaultDates();
  const location = searchParams.get("location") ?? "";
  const deferredLocation = useDeferredValue(location);
  const category = searchParams.getAll("category").filter((value): value is HistoryCategory => value in historyCategoryLabels);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const filters: HistoryFilters = {
    from: searchParams.get("from") ?? defaults.from,
    to: searchParams.get("to") ?? defaults.to,
    category,
    location: deferredLocation,
    page,
    page_size: pageSize,
  };
  const history = useHistory(filters);

  function setFilter(name: string, value: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(name, value); else next.delete(name);
      next.delete("page");
      return next;
    }, { replace: true });
  }

  function setCategories(values: HistoryCategory[]) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("category");
      values.forEach((value) => next.append("category", value));
      next.delete("page");
      return next;
    }, { replace: true });
  }

  function setPage(nextPage: number) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextPage > 1) next.set("page", String(nextPage)); else next.delete("page");
      return next;
    });
  }

  function resetFilters() {
    setSearchParams({ from: defaults.from, to: defaults.to }, { replace: true });
  }

  const summary = history.data?.summary;
  const stats = [
    { label: "Aktiviteter i alt", value: summary?.total, note: "I det valgte interval", tone: "blue", icon: CalendarIcon },
    { label: "Brud", value: summary?.breaks, note: "Mistænkte og bekræftede brud", tone: "danger", icon: ToolIcon },
    { label: "Vandlukninger", value: summary?.shutdowns, note: location ? `Registreret ved ${location}` : "Planlagte lukninger", tone: "violet", icon: CalendarIcon },
    { label: "Andet gravearbejde", value: summary?.excavations, note: "Registreret planlagt arbejde", tone: "amber", icon: ToolIcon },
    { label: "Andre hændelser", value: summary?.other_incidents, note: "Øvrige driftsforstyrrelser", tone: "blue", icon: ToolIcon },
  ];

  return <div className="history-page">
    <header className="history-heading">
      <div><span className="eyebrow">Bestyrelsens overblik</span><h1>Historik</h1><p>Se brud, vandlukninger og gravearbejde i en valgt periode og på et bestemt sted.</p></div>
      <a className="primary-button" href={historyCsvUrl(filters)} download><DownloadIcon />Eksportér CSV</a>
    </header>

    <section className="history-filters" aria-label="Filtrér historik">
      <label>Fra<input type="date" value={filters.from} max={filters.to} onChange={(event) => setFilter("from", event.target.value)} /></label>
      <label>Til<input type="date" value={filters.to} min={filters.from} onChange={(event) => setFilter("to", event.target.value)} /></label>
       <MultiSelectButtonGroup className="history-category-filter" label="Aktivitetstype" value={category} onChange={setCategories} options={Object.entries(historyCategoryLabels).map(([value, label]) => ({ value: value as HistoryCategory, label }))} />
      <label className="history-location-filter">Sted<input type="search" value={location} onChange={(event) => setFilter("location", event.target.value)} placeholder="Vej, postnr. eller by" /></label>
      <button type="button" className="secondary-button" onClick={resetFilters}>Nulstil filtre</button>
    </section>

    <section className="stat-grid history-stats" aria-label="Nøgletal for perioden">
      {stats.map(({ label, value, note, tone, icon: StatIcon }) => <article className={`stat-card stat-card--${tone}`} key={label}><div className="stat-card__top"><span className="stat-icon"><StatIcon /></span></div><strong>{history.isLoading ? "…" : String(value ?? 0)}</strong><h2>{label}</h2><p>{note}</p></article>)}
    </section>

    <section className="panel history-results" aria-labelledby="history-results-title">
      <header className="panel__header"><div><span className="eyebrow">Sagsregister</span><h2 id="history-results-title">Aktiviteter</h2></div>{summary && <span>{summary.total} resultater</span>}</header>
      {history.isLoading && <div className="history-state" role="status"><span className="loader" />Henter historik…</div>}
      {history.isError && <div className="history-state history-state--error" role="alert"><strong>Historikken kunne ikke hentes</strong><button type="button" onClick={() => history.refetch()}>Prøv igen</button></div>}
      {history.data?.items.length === 0 && <div className="history-state"><strong>Ingen aktiviteter matcher filtrene</strong><span>Prøv et længere interval eller et andet sted.</span></div>}
      {history.data && history.data.items.length > 0 && <div className="history-list">
        {history.data.items.map((item) => <Link className={`history-row history-row--${item.category}`} to={item.href} key={`${item.source}-${item.id}`}>
          <span className="history-row__date"><strong>{new Intl.DateTimeFormat("da-DK", { day: "2-digit" }).format(new Date(item.occurred_at))}</strong><small>{new Intl.DateTimeFormat("da-DK", { month: "short", year: "numeric" }).format(new Date(item.occurred_at))}</small></span>
          <span className="history-row__main"><span><b>{historyCategoryLabels[item.category]}</b><small>{statusLabel(item.status)}</small></span><strong>{item.title}</strong><small>{item.number} · {locationSummary(item.locations)}</small></span>
          <span className="history-row__meta"><time dateTime={item.occurred_at}>{formatDate(item.occurred_at)}</time>{item.affected_address_count !== null && <small>{item.affected_address_count} berørte adresser</small>}</span>
          <span className="row-arrow" aria-hidden="true">→</span>
        </Link>)}
      </div>}
      {history.data && history.data.total_pages > 1 && <footer className="history-pagination"><button type="button" className="secondary-button" disabled={page === 1} onClick={() => setPage(page - 1)}>Forrige</button><span>Side {page} af {history.data.total_pages}</span><button type="button" className="secondary-button" disabled={page >= history.data.total_pages} onClick={() => setPage(page + 1)}>Næste</button></footer>}
    </section>
  </div>;
}
