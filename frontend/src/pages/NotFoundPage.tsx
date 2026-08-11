import { Link } from "react-router-dom";

export function NotFoundPage() {
  return <main className="not-found"><strong>404</strong><h1>Siden blev ikke fundet</h1><p>Adressen findes ikke i driftssystemet.</p><Link className="primary-button" to="/">Til overblikket</Link></main>;
}
