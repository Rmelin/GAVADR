import { Link, useSearchParams } from "react-router-dom";
import type { ActivityFilters } from "../api/auditLogs";
import { useActivity, useAuditUsers } from "../hooks/useAuditLogs";
import { auditDescription, auditDetail } from "./DashboardPage";

const pageSize = 25;

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const activityType = searchParams.get("activity_type");
  const filters: ActivityFilters = {
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    actor_user_id: searchParams.get("actor_user_id") ?? "",
    activity_type: activityType === "login" || activityType === "changes" ? activityType : "all",
    page,
    page_size: pageSize,
  };
  const activity = useActivity(filters);
  const users = useAuditUsers();

  function setFilter(name: string, value: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value && value !== "all") next.set(name, value); else next.delete(name);
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

  return <div className="activity-page">
    <header className="history-heading">
      <div><span className="eyebrow">Revisionsspor</span><h1>Aktivitet</h1><p>Se hvem der har ændret noget i systemet, og hvornår brugerne senest loggede ind.</p></div>
      <Link className="secondary-button" to="/historik">Åbn sagshistorik</Link>
    </header>

    <section className="panel login-overview" aria-labelledby="login-overview-title">
      <header className="panel__header"><div><span className="eyebrow">Brugere</span><h2 id="login-overview-title">Seneste login</h2></div></header>
      {users.isLoading && <p className="activity-state">Henter brugere…</p>}
      {users.isError && <p className="activity-state activity-state--error">Brugernes loginstatus kunne ikke hentes.</p>}
      {users.data && <div className="login-grid">{users.data.map((user) => <article key={user.id} className="login-card">
        <span className={`status-dot${user.is_active ? "" : " status-dot--inactive"}`} />
        <div><strong>{user.display_name}</strong><small>{user.is_active ? "Aktiv bruger" : "Deaktiveret"}</small></div>
        <time dateTime={user.last_login_at ?? undefined}>{user.last_login_at ? formatTimestamp(user.last_login_at) : "Aldrig logget ind"}</time>
      </article>)}</div>}
    </section>

    <section className="activity-filters" aria-label="Filtrér aktivitet">
      <label>Fra<input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => setFilter("from", event.target.value)} /></label>
      <label>Til<input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => setFilter("to", event.target.value)} /></label>
      <label>Bruger<select value={filters.actor_user_id} onChange={(event) => setFilter("actor_user_id", event.target.value)}><option value="">Alle brugere</option>{users.data?.map((user) => <option value={user.id} key={user.id}>{user.display_name}</option>)}</select></label>
      <label>Type<select value={filters.activity_type} onChange={(event) => setFilter("activity_type", event.target.value)}><option value="all">Alle aktiviteter</option><option value="changes">Ændringer</option><option value="login">Login</option></select></label>
      <button type="button" className="secondary-button" onClick={() => setSearchParams({}, { replace: true })}>Nulstil filtre</button>
    </section>

    <section className="panel activity-results" aria-labelledby="activity-results-title">
      <header className="panel__header"><div><span className="eyebrow">Log</span><h2 id="activity-results-title">Registrerede aktiviteter</h2></div>{activity.data && <span>{activity.data.total} resultater</span>}</header>
      {activity.isLoading && <p className="activity-state">Henter aktivitet…</p>}
      {activity.isError && <div className="activity-state activity-state--error"><strong>Aktiviteten kunne ikke hentes</strong><button type="button" onClick={() => activity.refetch()}>Prøv igen</button></div>}
      {activity.data?.items.length === 0 && <p className="activity-state">Ingen aktiviteter matcher filtrene.</p>}
      {activity.data && activity.data.items.length > 0 && <div className="activity-table">{activity.data.items.map((entry) => <article key={entry.id}>
        <time dateTime={entry.created_at}>{formatTimestamp(entry.created_at)}</time>
        <div><strong>{entry.actor_name}</strong><span>{auditDescription(entry)}</span>{auditDetail(entry) && <small>{auditDetail(entry)}</small>}</div>
        <span className={`activity-kind activity-kind--${entry.action === "login" ? "login" : "change"}`}>{entry.action === "login" ? "Login" : "Ændring"}</span>
      </article>)}</div>}
      {activity.data && activity.data.total_pages > 1 && <footer className="history-pagination"><button type="button" className="secondary-button" disabled={page === 1} onClick={() => setPage(page - 1)}>Forrige</button><span>Side {page} af {activity.data.total_pages}</span><button type="button" className="secondary-button" disabled={page >= activity.data.total_pages} onClick={() => setPage(page + 1)}>Næste</button></footer>}
    </section>
  </div>;
}
