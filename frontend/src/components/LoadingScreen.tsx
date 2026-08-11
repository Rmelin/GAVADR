import { Brand } from "./Brand";

export function LoadingScreen() {
  return <main className="loading-screen" aria-live="polite"><Brand /><span className="loader" /><span>Henter driftsoverblik…</span></main>;
}
