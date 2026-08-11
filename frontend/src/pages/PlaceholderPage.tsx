import { useLocation } from "react-router-dom";
import { ToolIcon } from "../components/Icons";

const titles: Record<string, string> = { "/kort": "Ledningskort", "/haendelser": "Hændelser", "/vandlukninger": "Vandlukninger", "/henvendelser": "Henvendelser", "/kortrettelser": "Kortrettelser", "/opgaver": "Opgaver", "/brugere": "Brugere" };

export function PlaceholderPage() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? "Side";
  return <section className="placeholder-page"><span className="placeholder-icon"><ToolIcon /></span><span className="eyebrow">Fase 2 · Kort og grunddata</span><h1>{title}</h1><p>Grundlaget er på plads. Funktionen bliver implementeret i en kommende fase.</p></section>;
}
