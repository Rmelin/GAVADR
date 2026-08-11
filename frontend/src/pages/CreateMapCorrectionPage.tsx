import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useCurrentUser } from "../hooks/useAuth";
import { useUserOptions } from "../hooks/useIncidents";
import { useCreateMapCorrection, useSupplierOptions } from "../hooks/useMapCorrections";
import { inquiryPriorityLabels, type InquiryPriority } from "../types/inquiries";
import { canCreateCorrections } from "../types/mapCorrections";

export function CreateMapCorrectionPage() {
  const { data: user, isLoading } = useCurrentUser();
  const allowed = canCreateCorrections(user?.roles);
  const [params] = useSearchParams();
  const [form, setForm] = useState({ title: "", description: "", category: "", priority: "medium", longitude: "", latitude: "", assigned_to_id: "", inquiry_id: params.get("inquiry_id") ?? "", supplier_id: "" });
  const users = useUserOptions(allowed);
  const suppliers = useSupplierOptions(allowed);
  const create = useCreateMapCorrection();
  const navigate = useNavigate();
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  if (isLoading) return <div className="incident-state">Kontrollerer adgang…</div>;
  if (!allowed) return <Navigate to="/kortrettelser" replace />;
  const boardOnly = user?.roles.includes("board_member") && !user.roles.some((role) => ["admin", "map_manager"].includes(role));

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const item = await create.mutateAsync({ title: form.title, description: form.description, category: form.category, priority: form.priority as InquiryPriority, longitude: Number(form.longitude.replace(",", ".")), latitude: Number(form.latitude.replace(",", ".")), assigned_to_id: form.assigned_to_id || null, inquiry_id: form.inquiry_id || null, supplier_id: form.supplier_id || null });
      navigate(`/kortrettelser/${item.id}`);
    } catch { /* Error is rendered below. */ }
  }

  return <div className="work-page">
    <Link className="back-link" to="/kortrettelser">← Tilbage til kortrettelser</Link>
    <header className="incident-page-heading"><div><span className="eyebrow">Ny kortændring</span><h1>Opret kortrettelse</h1><p>Beskriv afvigelsen, kategorien og punktets koordinater.</p></div></header>
    <form className="incident-create-form" onSubmit={submit}><section className="form-section"><header><span>01</span><div><h2>Rettelse</h2><p>Hvad skal ændres i kortgrundlaget?</p></div></header><div className="form-fields">
      <label className="field field--wide">Titel<input required value={form.title} onChange={(event) => set("title", event.target.value)} /></label>
      <label className="field field--wide">Beskrivelse<textarea required rows={6} value={form.description} onChange={(event) => set("description", event.target.value)} /></label>
      <label className="field">Kategori<input required maxLength={80} value={form.category} onChange={(event) => set("category", event.target.value)} placeholder="Fx ledning, ventil eller adresse" /></label>
      <label className="field">Prioritet<select value={form.priority} onChange={(event) => set("priority", event.target.value)}>{Object.entries(inquiryPriorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field">Ansvarlig<select value={form.assigned_to_id} onChange={(event) => set("assigned_to_id", event.target.value)}><option value="">Ikke tildelt</option>{users.data?.map((option) => <option value={option.id} key={option.id}>{option.display_name}</option>)}</select></label>
      <label className="field">Leverandør<select value={form.supplier_id} onChange={(event) => set("supplier_id", event.target.value)}><option value="">Ikke valgt</option>{suppliers.data?.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
      <label className="field">Længdegrad<input required inputMode="decimal" value={form.longitude} onChange={(event) => set("longitude", event.target.value)} /></label>
      <label className="field">Breddegrad<input required inputMode="decimal" value={form.latitude} onChange={(event) => set("latitude", event.target.value)} /></label>
      <label className="field field--wide">Tilknyttet henvendelse, ID<input required={boardOnly} value={form.inquiry_id} onChange={(event) => set("inquiry_id", event.target.value)} /></label>
      {boardOnly && <p className="field field--wide">Som bestyrelsesmedlem kan du kun oprette en kortrettelse fra en henvendelse.</p>}
    </div></section>
    {create.isError && <div className="form-error">{create.error.message}</div>}
    <footer className="form-actions"><Link className="secondary-button" to="/kortrettelser">Annuller</Link><button className="primary-button" disabled={create.isPending}>Opret kortrettelse</button></footer></form>
  </div>;
}
