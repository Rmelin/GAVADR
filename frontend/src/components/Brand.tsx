import { useEffect } from "react";
import { DropIcon } from "./Icons";
import { useAppSettings } from "../hooks/useAppSettings";

export function Brand({ compact = false }: { compact?: boolean }) {
  const { data } = useAppSettings();
  useEffect(() => { document.title = `${data.organization_name} · Drift`; }, [data.organization_name]);
  return <div className={`brand ${compact ? "brand--compact" : ""}`}>
    <span className="brand__mark"><DropIcon /></span>
    <span className="brand__text"><strong>{data.organization_name}</strong><small>{data.organization_locality || "VANDVÆRK · DRIFT"}</small></span>
  </div>;
}
