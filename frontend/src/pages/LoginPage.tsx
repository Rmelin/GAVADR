import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";
import { useCurrentUser, useLogin } from "../hooks/useAuth";
import { useAppSettings } from "../hooks/useAppSettings";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const currentUser = useCurrentUser();
  const { data: appSettings } = useAppSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/";

  if (currentUser.data) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      navigate(returnTo, { replace: true });
    } catch {
      // The mutation error is announced directly below the form fields.
    }
  }

  const errorMessage = login.error instanceof ApiError && login.error.status === 401
    ? "E-mail eller adgangskode er forkert."
    : login.error ? login.error.message : null;

  return <main className="login-page">
    <div className="login-page__glow" />
    <header className="login-header"><Brand /><ThemeToggle /></header>
    <section className="login-layout">
      <div className="login-intro">
        <span className="kicker"><span /> Sikker driftsadgang</span>
        <h1>Overblik over<br /><em>vandet under os.</em></h1>
        <p>Ét samlet sted til hændelser, ledningsnet og den daglige drift af {appSettings.organization_name}.</p>
        <div className="network-art" aria-hidden="true"><i/><i/><i/><i/><i/><span className="network-art__drop">{appSettings.organization_name.charAt(0).toUpperCase()}</span></div>
      </div>
      <div className="login-card-wrap">
        <form className="login-card" onSubmit={handleSubmit} aria-labelledby="login-title">
          <div><span className="eyebrow">Velkommen tilbage</span><h2 id="login-title">Log ind på driftssystemet</h2><p>Brug din personlige vandværkskonto.</p></div>
          <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="navn@vandvaerk.dk" /></div>
          <div className="field"><label htmlFor="password">Adgangskode</label><input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
          <button className="primary-button" type="submit" disabled={login.isPending}>{login.isPending ? "Logger ind…" : "Log ind"}<span aria-hidden="true">→</span></button>
          <p className="login-help">Problemer med adgang? Kontakt systemadministratoren.</p>
        </form>
        <div className="secure-note"><span>◉</span> Forbindelsen er beskyttet og aktivitet logges</div>
      </div>
    </section>
  </main>;
}
