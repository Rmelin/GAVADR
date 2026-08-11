import { useDeferredValue, useState, type FormEvent } from "react";
import { useCurrentUser } from "../hooks/useAuth";
import { useCreateUser, useUpdateUser, useUsers } from "../hooks/useUsers";
import { roleLabel, roles, type Role, type User, type UserCreatePayload, type UserUpdatePayload } from "../types/auth";
import { MultiSelectButtonGroup } from "../components/MultiSelectButtonGroup";

type Confirmation = { user: User; kind: "status" | "password"; password?: string } | null;
const emptyCreate: UserCreatePayload = { email: "", display_name: "", password: "", roles: ["reader"] };

function RoleFields({ selected, onChange, disabled = false, idPrefix }: { selected: Role[]; onChange: (roles: Role[]) => void; disabled?: boolean; idPrefix: string }) {
  return <fieldset className="role-fields" disabled={disabled}><legend>Roller</legend>{roles.map((role) => <label key={role} htmlFor={`${idPrefix}-${role}`}><input id={`${idPrefix}-${role}`} type="checkbox" checked={selected.includes(role)} onChange={(event) => onChange(event.target.checked ? [...selected, role] : selected.filter((item) => item !== role))} /><span>{roleLabel(role)}</span></label>)}</fieldset>;
}

function UserEditor({ user, currentUserId, busy, onSave, onConfirm }: { user: User; currentUserId?: string; busy: boolean; onSave: (id: string, payload: UserUpdatePayload) => Promise<void>; onConfirm: (value: Confirmation) => void }) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.display_name);
  const [selectedRoles, setSelectedRoles] = useState<Role[]>(user.roles);
  const [resetOpen, setResetOpen] = useState(false);
  const [password, setPassword] = useState("");
  const self = currentUserId === user.id;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!displayName.trim() || !selectedRoles.length) return;
    try {
      await onSave(user.id, { display_name: displayName.trim(), roles: selectedRoles });
      setEditing(false);
    } catch { /* Keep the editor open; the page shows the API error. */ }
  }

  return <article className={`user-card ${user.is_active ? "" : "user-card--inactive"}`}>
    <header><span className="user-avatar">{user.display_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><h2>{user.display_name}{self && <small> Dig</small>}</h2><p>{user.email}</p></div><span className={`user-status ${user.is_active ? "user-status--active" : ""}`}>{user.is_active ? "Aktiv" : "Deaktiveret"}</span></header>
    {editing ? <form className="user-edit-form" onSubmit={(event) => void save(event)}><label className="field">Visningsnavn<input required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><RoleFields idPrefix={`edit-${user.id}`} selected={selectedRoles} onChange={setSelectedRoles} disabled={busy} /><div className="user-card__actions"><button type="button" className="secondary-button" onClick={() => { setEditing(false); setDisplayName(user.display_name); setSelectedRoles(user.roles); }}>Annuller</button><button className="primary-button" disabled={busy || !displayName.trim() || !selectedRoles.length}>Gem ændringer</button></div></form> : <><div className="role-chips">{user.roles.map((role) => <span key={role}>{roleLabel(role)}</span>)}</div><p className="user-created">Oprettet {new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(new Date(user.created_at))}</p><div className="user-card__actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditing(true)}>Rediger</button><button className="secondary-button" type="button" disabled={busy} onClick={() => setResetOpen(true)}>Nulstil adgangskode</button><button className={user.is_active ? "danger-button" : "secondary-button"} type="button" disabled={busy || self} title={self ? "Du kan ikke deaktivere dig selv" : undefined} onClick={() => onConfirm({ user, kind: "status" })}>{user.is_active ? "Deaktiver" : "Aktiver"}</button></div></>}
    {resetOpen && <form className="password-reset" onSubmit={(event) => { event.preventDefault(); if (password.length >= 12) { onConfirm({ user, kind: "password", password }); setPassword(""); setResetOpen(false); } }}><label className="field">Ny midlertidig adgangskode<input autoComplete="new-password" minLength={12} maxLength={128} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /><small>Mindst 12 tegn. Adgangskoden vises ikke efter nulstilling.</small></label><div className="user-card__actions"><button type="button" className="secondary-button" onClick={() => { setResetOpen(false); setPassword(""); }}>Annuller</button><button className="primary-button" disabled={busy || password.length < 12}>Fortsæt</button></div></form>}
  </article>;
}

export function UsersPage() {
  const { data: currentUser } = useCurrentUser();
  const users = useUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<UserCreatePayload>(emptyCreate);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Array<"active" | "inactive">>([]);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("da"));
  const busy = create.isPending || update.isPending;
  const filtered = users.data?.filter((user) => (statusFilter.length !== 1 || (statusFilter[0] === "active") === user.is_active) && (!deferredSearch || `${user.display_name} ${user.email} ${user.roles.map(roleLabel).join(" ")}`.toLocaleLowerCase("da").includes(deferredSearch))) ?? [];
  const active = users.data?.filter((user) => user.is_active).length ?? 0;
  const admins = users.data?.filter((user) => user.is_active && user.roles.includes("admin")).length ?? 0;

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    if (!form.roles.length || form.password.length < 12) return;
    try { await create.mutateAsync({ ...form, email: form.email.trim(), display_name: form.display_name.trim() }); setForm(emptyCreate); setCreateOpen(false); } catch { /* Mutation error is shown in the form. */ }
  }
  async function save(id: string, payload: UserUpdatePayload) {
    await update.mutateAsync({ id, payload });
  }
  async function confirmAction() {
    if (!confirmation) return;
    const payload = confirmation.kind === "status" ? { is_active: !confirmation.user.is_active } : { password: confirmation.password };
    try { await update.mutateAsync({ id: confirmation.user.id, payload }); setConfirmation(null); } catch { /* Keep the dialog open and show the API error. */ }
  }

  return <div className="users-page"><header className="users-heading"><div><span className="eyebrow">Administration</span><h1>Brugere</h1><p>Styr adgang, roller og kontostatus sikkert ét sted.</p></div><button className="primary-button" type="button" onClick={() => setCreateOpen((open) => !open)}>{createOpen ? "Luk formular" : "+ Opret bruger"}</button></header>
    <section className="user-stats" aria-label="Brugeroverblik"><div><strong>{users.data?.length ?? "–"}</strong><span>Brugere i alt</span></div><div><strong>{active}</strong><span>Aktive konti</span></div><div><strong>{admins}</strong><span>Aktive administratorer</span></div><div><strong>{(users.data?.length ?? 0) - active}</strong><span>Deaktiverede</span></div></section>
    {createOpen && <form className="create-user-panel" onSubmit={(event) => void submitCreate(event)}><header><div><span className="eyebrow">Ny adgang</span><h2>Opret bruger</h2></div><p>Den midlertidige adgangskode deles ad en sikker kanal.</p></header><div className="create-user-fields"><label className="field">E-mail<input autoComplete="off" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="field">Visningsnavn<input required maxLength={120} value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label><label className="field">Midlertidig adgangskode<input autoComplete="new-password" type="password" required minLength={12} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>Mindst 12 tegn. Gemmes aldrig som læsbar tekst.</small></label><RoleFields idPrefix="create" selected={form.roles} onChange={(selected) => setForm({ ...form, roles: selected })} disabled={busy} /></div>{create.isError && <div className="form-error" role="alert">{create.error.message}</div>}<footer><button type="button" className="secondary-button" onClick={() => { setCreateOpen(false); setForm(emptyCreate); }}>Annuller</button><button className="primary-button" disabled={busy || !form.roles.length || form.password.length < 12}>Opret bruger</button></footer></form>}
    <section className="user-tools"><label className="user-search"><span>Søg</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Navn, e-mail eller rolle" /></label><MultiSelectButtonGroup label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: "active", label: "Aktive" }, { value: "inactive", label: "Deaktiverede" }]} /><p>{filtered.length} {filtered.length === 1 ? "bruger" : "brugere"}</p></section>
    {update.isError && <div className="form-error users-error" role="alert">{update.error.message}</div>}
    {users.isLoading && <div className="users-state"><span className="loader" />Indlæser brugere…</div>}
    {users.isError && <div className="users-state"><p>Brugerne kunne ikke hentes.</p><button className="secondary-button" onClick={() => void users.refetch()}>Prøv igen</button></div>}
    {users.data && !filtered.length && <div className="users-state"><p>Ingen brugere matcher din søgning.</p></div>}
    <section className="user-grid" aria-live="polite">{filtered.map((user) => <UserEditor key={user.id} user={user} currentUserId={currentUser?.id} busy={busy} onSave={save} onConfirm={setConfirmation} />)}</section>
    {confirmation && <div className="confirmation-backdrop"><div className={`confirmation-dialog ${confirmation.kind === "status" && confirmation.user.is_active ? "confirmation-dialog--danger" : ""}`} role="dialog" aria-modal="true" aria-labelledby="user-confirm-title"><span className="eyebrow">Bekræft handling</span><h3 id="user-confirm-title">{confirmation.kind === "password" ? "Nulstil adgangskode?" : `${confirmation.user.is_active ? "Deaktiver" : "Aktiver"} ${confirmation.user.display_name}?`}</h3><p>{confirmation.kind === "password" ? `Der sættes en ny midlertidig adgangskode for ${confirmation.user.email}. Adgangskoden vises ikke her eller efter nulstillingen.` : confirmation.user.is_active ? "Brugeren mister straks adgang, men data og historik bevares." : "Brugeren får straks adgang igen med sine nuværende roller."}</p>{update.isError && <div className="form-error" role="alert">{update.error.message}</div>}<div><button className="secondary-button" type="button" disabled={update.isPending} onClick={() => setConfirmation(null)}>Annuller</button><button className={confirmation.kind === "status" && confirmation.user.is_active ? "danger-button" : "primary-button"} type="button" disabled={update.isPending} onClick={() => void confirmAction()}>{update.isPending ? "Gemmer…" : "Bekræft"}</button></div></div></div>}
  </div>;
}
