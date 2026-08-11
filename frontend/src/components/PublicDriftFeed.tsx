import type { PublicFeed, PublicFeedItem } from "../api/publicStatus";

const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeStyle: "short" }).format(new Date(value))
  : "Ikke oplyst";

function itemKind(item: PublicFeedItem, now: number) {
  if (item.resolved) return "Afsluttet";
  if (item.source_type === "incident") return "Brud / driftsforstyrrelse";
  if (item.active_now) return "Aktiv vandlukning";
  return new Date(item.start_at).getTime() > now ? "Planlagt arbejde" : "Vandlukning afsluttet";
}

export function PublicDriftFeed({ feed, preview = false }: { feed: PublicFeed; preview?: boolean }) {
  const now = Date.now();
  const activeItems = feed.items.filter((item) => !item.resolved);
  const hasIncident = activeItems.some((item) => item.source_type === "incident" && item.active_now);
  const hasActiveShutdown = activeItems.some((item) => item.source_type === "shutdown" && item.active_now);
  const plannedCount = activeItems.filter((item) => item.source_type === "shutdown" && new Date(item.start_at).getTime() > now).length;
  const normal = feed.status === "normal_drift";
  const plannedOnly = feed.status === "planlagt_arbejde";
  const headline = normal
    ? "Vandforsyningen kører normalt"
    : plannedOnly
      ? "Driften er normal nu"
      : hasIncident
      ? "Der er et brud eller en driftsforstyrrelse"
      : hasActiveShutdown
        ? "Der er en aktuel vandlukning"
        : "Der er planlagt arbejde";

  return <div className={`public-drift-feed${preview ? " public-drift-feed--preview" : ""}`}>
    <section className={`public-drift-hero public-drift-hero--${normal ? "normal" : plannedOnly ? "planned" : "attention"}`} aria-live="polite">
      <span className="public-drift-signal" aria-hidden="true"><i /></span>
      <div><span className="public-drift-kicker">Driftsstatus lige nu</span><h1>{headline}</h1>{plannedOnly && <strong className="public-drift-normal-until">Der er planlagt arbejde</strong>}<p>{normal ? "Der er ingen aktive driftsforstyrrelser, vandlukninger eller planlagte arbejder registreret." : plannedOnly ? `Der er ${plannedCount} ${plannedCount === 1 ? "planlagt arbejde" : "planlagte arbejder"} senere. Se tidspunkt og berørt område nedenfor.` : `${activeItems.filter((item) => item.active_now).length} aktiv ${activeItems.filter((item) => item.active_now).length === 1 ? "meddelelse" : "meddelelser"}${plannedCount ? ` · ${plannedCount} planlagt` : ""}.`}</p></div>
    </section>

    {feed.items.length > 0 && <section className="public-drift-notices" aria-label="Aktuel driftsinformation">
      <header><div><span className="public-drift-kicker">Seneste meddelelser</span><h2>Driftsinformation</h2></div><span>{feed.items.length} {feed.items.length === 1 ? "meddelelse" : "meddelelser"}</span></header>
      <div className="public-drift-list">{feed.items.map((item, index) => <article className={`public-drift-item public-drift-item--${item.severity}${item.resolved ? " public-drift-item--resolved" : ""}${item.active_now ? " public-drift-item--active" : ""}`} key={`${item.title}-${item.start_at}-${index}`}>
        {item.active_now && item.source_type === "shutdown" && <div className="public-drift-active-alert" role="status"><span />Vandlukningen er aktiv nu</div>}
        <div className="public-drift-item__meta"><span>{itemKind(item, now)}</span>{item.resolved && <span>Løst</span>}</div>
        <h3>{item.title}</h3>
        <p>{item.message}</p>
        {item.areas.length > 0 && <div className="public-drift-areas"><strong>Berørte områder</strong><span>{item.areas.join(" · ")}</span></div>}
        <dl><div><dt>Fra</dt><dd>{dateTime(item.start_at)}</dd></div><div><dt>Forventet afsluttet</dt><dd>{dateTime(item.expected_end_at)}</dd></div></dl>
      </article>)}</div>
    </section>}

    <footer className="public-drift-updated"><span className={`public-drift-dot public-drift-dot--${normal ? "normal" : plannedOnly ? "planned" : "attention"}`} />Senest opdateret {feed.updated_at ? dateTime(feed.updated_at) : "ingen meddelelser endnu"}</footer>
  </div>;
}
