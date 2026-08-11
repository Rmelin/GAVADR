import { useSearchParams } from "react-router-dom";
import { Brand } from "../components/Brand";
import { PublicDriftFeed } from "../components/PublicDriftFeed";
import { usePublicFeed } from "../hooks/usePublicStatus";
import { useAppSettings } from "../hooks/useAppSettings";

export function PublicDriftPage() {
  const [searchParams] = useSearchParams();
  const embedded = searchParams.get("embed") === "1";
  const feed = usePublicFeed();
  const { data: appSettings } = useAppSettings();

  return <div className={`public-drift-page${embedded ? " public-drift-page--embedded" : ""}`}>
    <a className="skip-link" href="#public-drift-content">Gå til driftsstatus</a>
    {!embedded && <header className="public-drift-header"><Brand /><div><span>{appSettings.organization_name}</span><strong>Offentlig driftsinformation</strong></div></header>}
    <main id="public-drift-content" className="public-drift-main">
      {feed.isLoading && <div className="public-drift-state" role="status"><span className="loader" />Henter aktuel driftsstatus…</div>}
      {feed.isError && <div className="public-drift-state public-drift-state--error" role="alert"><strong>Driftsstatus kunne ikke hentes</strong><p>Prøv at genindlæse siden om et øjeblik.</p><button type="button" onClick={() => feed.refetch()}>Prøv igen</button></div>}
      {feed.data && <PublicDriftFeed feed={feed.data} />}
    </main>
    {!embedded && <footer className="public-drift-footer"><span>{appSettings.organization_name}</span>{(appSettings.organization_address || appSettings.organization_locality) && <address>{[appSettings.organization_address, appSettings.organization_locality].filter(Boolean).join(" · ")}</address>}<p>Ved akutte problemer med vandforsyningen kontaktes vandværket via de normale kontaktkanaler.</p></footer>}
  </div>;
}
