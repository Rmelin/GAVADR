import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useAuth";
import { useUserOptions } from "../hooks/useIncidents";
import { useCreateTask } from "../hooks/useTasks";
import { canMutateTasks, taskPriorityLabels, type TaskCreatePayload } from "../types/tasks";
import type { InquiryPriority } from "../types/inquiries";

export function CreateTaskPage() {
  const { data: user, isLoading } = useCurrentUser();
  const allowed = canMutateTasks(user?.roles);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", due_date: "", assigned_to_id: "", relation_type: "", relation_id: "" });
  const users = useUserOptions(allowed);
  const create = useCreateTask();
  const navigate = useNavigate();
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  if (isLoading) return <div className="incident-state">Kontrollerer adgang…</div>;
  if (!allowed) return <Navigate to="/opgaver" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const relation = form.relation_type && form.relation_id ? { [`${form.relation_type}_id`]: form.relation_id } : {};
    try {
      const item = await create.mutateAsync({ title: form.title, description: form.description || null, priority: form.priority as InquiryPriority, status: "open", due_date: form.due_date || null, assigned_to_id: form.assigned_to_id || null, ...relation } as TaskCreatePayload);
      navigate(`/opgaver/${item.id}`);
    } catch { /* Error is rendered below. */ }
  }

  return <div className="work-page">
    <Link className="back-link" to="/opgaver">← Tilbage til opgaver</Link>
    <header className="incident-page-heading"><div><span className="eyebrow">Ny handling</span><h1>Opret opgave</h1><p>Gør næste handling tydelig med ansvar, frist og én relation.</p></div></header>
    <form className="incident-create-form" onSubmit={submit}><section className="form-section"><header><span>01</span><div><h2>Opgaven</h2><p>Beskriv det konkrete resultat.</p></div></header><div className="form-fields">
      <label className="field field--wide">Titel<input required value={form.title} onChange={(event) => set("title", event.target.value)} /></label>
      <label className="field field--wide">Beskrivelse<textarea rows={5} value={form.description} onChange={(event) => set("description", event.target.value)} /></label>
      <label className="field">Prioritet<select value={form.priority} onChange={(event) => set("priority", event.target.value)}>{Object.entries(taskPriorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field">Frist<input type="date" value={form.due_date} onChange={(event) => set("due_date", event.target.value)} /></label>
      <label className="field">Ansvarlig<select value={form.assigned_to_id} onChange={(event) => set("assigned_to_id", event.target.value)}><option value="">Ikke tildelt</option>{users.data?.map((option) => <option value={option.id} key={option.id}>{option.display_name}</option>)}</select></label>
      <label className="field">Relationstype<select value={form.relation_type} onChange={(event) => { set("relation_type", event.target.value); set("relation_id", ""); }}><option value="">Ingen</option><option value="incident">Hændelse</option><option value="inquiry">Henvendelse</option><option value="correction">Kortrettelse</option></select></label>
      <label className="field">Relateret ID<input required={Boolean(form.relation_type)} disabled={!form.relation_type} value={form.relation_id} onChange={(event) => set("relation_id", event.target.value)} /></label>
    </div></section>
    {create.isError && <div className="form-error">{create.error.message}</div>}
    <footer className="form-actions"><Link className="secondary-button" to="/opgaver">Annuller</Link><button className="primary-button" disabled={create.isPending}>Opret opgave</button></footer></form>
  </div>;
}
