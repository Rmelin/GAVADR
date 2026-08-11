import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { AlertIcon, CalendarIcon, CheckIcon, MapIcon, MessageIcon, PlusIcon, ToolIcon } from "../components/Icons";
import { useCurrentUser } from "../hooks/useAuth";
import { useIncidents } from "../hooks/useIncidents";
import { usePlannedShutdowns } from "../hooks/usePlannedShutdowns";
import { canMutateIncidents, priorityLabels } from "../types/incidents";
import { canMutateShutdowns } from "../types/plannedShutdowns";
import { useInquiries } from "../hooks/useInquiries";
import { useMapCorrections } from "../hooks/useMapCorrections";
import { useTasks } from "../hooks/useTasks";
import { canMutateInquiries } from "../types/inquiries";
import { taskPriorityLabels } from "../types/tasks";
import { formatWorkDate } from "../components/WorkItemUi";
import { PublicDriftFeed } from "../components/PublicDriftFeed";
import { usePublicFeed } from "../hooks/usePublicStatus";
import { useAuditLogs } from "../hooks/useAuditLogs";
import type { AuditLogSummary } from "../api/auditLogs";
import { useDashboardMap } from "../hooks/useDashboardMap";
import { useAppSettings } from "../hooks/useAppSettings";

const DashboardOperationalMap = lazy(() => import("../map/DashboardOperationalMap").then((module) => ({ default: module.DashboardOperationalMap })));

const auditObjectLabels: Record<string, string> = {
  incident: "en hændelse", incident_update: "en hændelse", planned_shutdown: "en vandlukning",
  public_status: "offentlig driftsstatus", inquiry: "en henvendelse", task: "en opgave",
  map_correction: "en kortrettelse", closure_area: "et lukkeområde", app_settings: "app-indstillinger",
  closure_scenario: "et lukkescenarie",
  user: "en bruger", supplier: "en leverandør", attachment: "et bilag", notification: "en besked",
};

function auditDescription(entry: AuditLogSummary) {
  if (entry.action === "login") return "loggede ind";
  const object = auditObjectLabels[entry.object_type] ?? entry.object_type.replaceAll("_", " ");
  if (entry.action.includes("published")) return `offentliggjorde ${object}`;
  if (entry.action.includes("withdraw") || entry.action.includes("cancel")) return `trak ${object} tilbage`;
  if (entry.action === "create" || entry.action.endsWith(".create")) return `oprettede ${object}`;
  if (entry.action.endsWith(".delete")) return `slettede ${object}`;
  if (entry.action === "comment") return `tilføjede en kommentar til ${object}`;
  if (entry.action === "upload") return `tilføjede et bilag til ${object}`;
  if (entry.action === "notify") return `sendte ${object}`;
  return `opdaterede ${object}`;
}

function auditDetail(entry: AuditLogSummary) {
  const identity = [entry.object_number, entry.object_title].filter(Boolean).join(" · ");
  if (entry.action === "planned_shutdown.published" && entry.starts_at && entry.expected_end_at) {
    const format = (value: string) => new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
    return `${identity ? `${identity}. ` : ""}Status blev sat til planlagt, og beskeden vises på /drift fra ${format(entry.starts_at)} til ${format(entry.expected_end_at)}.`;
  }
  return identity || undefined;
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "lige nu";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min. siden`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} t. siden`;
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function DashboardPage() {
  const { data: user } = useCurrentUser();
  const incidents = useIncidents([], "");
  const shutdowns = usePlannedShutdowns([]);
  const inquiries = useInquiries({ status: ["new"] });
  const corrections = useMapCorrections();
  const tasks = useTasks({ status: ["open"], mine: "true" });
  const publicFeed = usePublicFeed();
  const auditLogs = useAuditLogs(5);
  const dashboardMap = useDashboardMap();
  const { data: appSettings } = useAppSettings();
  const firstName = user?.display_name.split(" ")[0] ?? "kollega";
  const canCreateIncident = canMutateIncidents(user?.roles);
  const canCreateShutdown = canMutateShutdowns(user?.roles);
  const activeIncidents = incidents.data?.filter((incident) => ["new", "assessing", "active", "monitoring"].includes(incident.status)) ?? [];
  const urgentCount = activeIncidents.filter((incident) => ["high", "critical"].includes(incident.priority)).length;
  const upcomingShutdowns = shutdowns.data?.filter((shutdown) => ["planned", "in_progress"].includes(shutdown.status)) ?? [];
  const stats = [
    { label: "Aktive hændelser", value: incidents.isLoading ? "…" : String(activeIncidents.length), note: `${urgentCount} med høj eller kritisk prioritet`, tone: "danger", icon: AlertIcon, href: "/haendelser" },
    { label: "Planlagte lukninger", value: shutdowns.isLoading ? "…" : String(upcomingShutdowns.length), note: "Planlagte og igangværende", tone: "blue", icon: CalendarIcon, href: "/vandlukninger" },
    { label: "Nye henvendelser", value: inquiries.isLoading ? "…" : String(inquiries.data?.length ?? 0), note: "Afventer første behandling", tone: "violet", icon: MessageIcon, href: "/henvendelser" },
    { label: "Åbne kortrettelser", value: corrections.isLoading ? "…" : String(corrections.data?.filter((item) => item.status !== "closed").length ?? 0), note: "Ikke afsluttede rettelser", tone: "amber", icon: ToolIcon, href: "/kortrettelser" },
  ];
  const today = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const myTasks = tasks.data ?? [];
  return <div className="dashboard">
    <section className="dashboard-heading"><div><span className="kicker"><span /> Driftsoverblik · {today}</span><h1>Godmorgen, {firstName}</h1><p>Her er situationen på ledningsnettet lige nu.</p></div><div className="quick-actions">{canMutateInquiries(user?.roles) && <Link className="quick-button" to="/henvendelser/ny"><MessageIcon />Registrer henvendelse</Link>}{canCreateIncident && <Link className="quick-button quick-button--danger" to="/haendelser/ny"><PlusIcon />Registrer brud</Link>}{canCreateShutdown && <Link className="quick-button" to="/vandlukninger/ny"><CalendarIcon />Opret vandlukning</Link>}</div></section>
    <section className="dashboard-public-preview" aria-labelledby="public-preview-title"><header><div><span className="eyebrow">Præcis offentlig forhåndsvisning</span><h2 id="public-preview-title">Status på /drift</h2></div><a href="/drift" target="_blank" rel="noreferrer">Åbn offentlig side ↗</a></header>{publicFeed.isLoading && <p className="empty-copy">Henter offentlig driftsstatus…</p>}{publicFeed.isError && <div className="form-error" role="alert">Den offentlige driftsstatus kunne ikke hentes.</div>}{publicFeed.data && <PublicDriftFeed feed={publicFeed.data} preview />}</section>
    <section className="stat-grid" aria-label="Nøgletal">
      {stats.map(({ label, value, note, tone, icon: StatIcon, href }) => <article className={`stat-card stat-card--${tone}`} key={label}><div className="stat-card__top"><span className="stat-icon"><StatIcon /></span><Link className="trend" to={href}>Se alle →</Link></div><strong>{value}</strong><h2>{label}</h2><p>{note}</p></article>)}
    </section>
    <div className="dashboard-grid">
      <section className="panel incidents-panel"><header className="panel__header"><div><span className="eyebrow">Kræver opmærksomhed</span><h2>Aktive driftsforstyrrelser</h2></div><Link to="/haendelser">Alle hændelser</Link></header>
        <div className="incident-list">
          {incidents.isLoading && <p className="empty-copy">Indlæser hændelser…</p>}
          {!incidents.isLoading && activeIncidents.length === 0 && <p className="empty-copy">Ingen aktive driftsforstyrrelser.</p>}
          {activeIncidents.slice(0, 3).map((incident) => <Link className="incident-row" to={`/haendelser/${incident.id}`} key={incident.id}><span className={`severity severity--${incident.priority}`}>{priorityLabels[incident.priority]}</span><div className="incident-row__main"><strong>{incident.title}</strong><span>{incident.number} · {new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(new Date(incident.registered_at))}</span></div><div className="incident-meta"><span>Ansvarlig</span><strong>{incident.assigned_to?.display_name ?? "Ikke tildelt"}</strong></div><span className="row-arrow">→</span></Link>)}
        </div>
      </section>
      <section className="panel map-preview"><header className="panel__header"><div><span className="eyebrow">Live kort</span><h2>Aktuelt i området</h2></div><Link to="/kort"><MapIcon /> Åbn kort</Link></header><div className="dashboard-map-preview" aria-label="Kort med aktuelle vandlukninger og hændelser">{dashboardMap.isLoading && <p className="network-live-state">Henter aktuelle positioner…</p>}{dashboardMap.isError && <p className="network-live-state">Kortstatus kunne ikke hentes.</p>}{dashboardMap.data && <><Suspense fallback={<p className="network-live-state">Indlæser kort…</p>}><DashboardOperationalMap data={dashboardMap.data} defaultLongitude={appSettings.map_default_longitude} defaultLatitude={appSettings.map_default_latitude} defaultZoom={appSettings.map_default_zoom} /></Suspense><div className="dashboard-map-legend"><span><i className="is-shutdown-planned" />Planlagt vandlukning</span><span><i className="is-shutdown-active" />Aktiv vandlukning</span><span><i className="is-incident-new" />Ny hændelse</span><span><i className="is-incident-active" />Aktiv hændelse</span></div>{dashboardMap.data.features.length === 0 && <p className="dashboard-map-empty">Ingen planlagte eller aktive driftssager på kortet.</p>}</>}</div></section>
      <section className="panel tasks-panel"><header className="panel__header"><div><span className="eyebrow">Din arbejdsdag</span><h2>Mine åbne opgaver</h2></div><Link to="/opgaver">Se alle</Link></header><ul className="task-list">{tasks.isLoading&&<li>Indlæser opgaver…</li>}{!tasks.isLoading&&myTasks.length===0&&<li>Du har ingen åbne opgaver.</li>}{myTasks.slice(0,3).map(task=><li key={task.id}><span className="task-check"><CheckIcon /></span><div><Link to={`/opgaver/${task.id}`}><strong>{task.title}</strong></Link><small>Frist {formatWorkDate(task.due_date)}</small></div><span className={task.priority==="critical"?"tag tag--red":"tag"}>{taskPriorityLabels[task.priority]}</span></li>)}</ul></section>
      <section className="panel activity-panel"><header className="panel__header"><div><span className="eyebrow">Revisionsspor</span><h2>Seneste aktivitet</h2></div><Link to="/historik">Åbn historik</Link></header><div className="activity">{auditLogs.isLoading && <p className="empty-copy">Henter seneste aktivitet…</p>}{auditLogs.isError && <p className="empty-copy">Aktiviteten kunne ikke hentes.</p>}{auditLogs.data?.length === 0 && <p className="empty-copy">Der er endnu ingen registreret aktivitet.</p>}{auditLogs.data?.map((entry, index) => <div key={entry.id}><span className={`activity-dot${index % 3 === 1 ? " activity-dot--blue" : index % 3 === 2 ? " activity-dot--amber" : ""}`} /><div className="activity-copy"><p><strong>{entry.actor_name}</strong> {auditDescription(entry)}</p>{auditDetail(entry) && <small>{auditDetail(entry)}</small>}</div><time dateTime={entry.created_at}>{relativeTime(entry.created_at)}</time></div>)}</div></section>
    </div>
  </div>;
}
