import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useAuth";
import { useUserOptions } from "../hooks/useIncidents";
import { useCreateInquiry } from "../hooks/useInquiries";
import { canMutateInquiries, inquiryCategoryLabels, inquiryChannelLabels, inquiryPriorityLabels, type InquiryChannel, type InquiryPriority } from "../types/inquiries";

const initial = { contact_name: "", contact_email: "", contact_phone: "", address_text: "", channel: "phone", category: "other", priority: "medium", assigned_to_id: "", follow_up_at: "", description: "", notes: "" };

export function CreateInquiryPage() {
  const { data: user, isLoading } = useCurrentUser();
  const allowed = canMutateInquiries(user?.roles);
  const [form, setForm] = useState(initial);
  const create = useCreateInquiry();
  const users = useUserOptions(allowed);
  const navigate = useNavigate();
  const set = (key: keyof typeof initial, value: string) => setForm((current) => ({ ...current, [key]: value }));
  if (isLoading) return <div className="incident-state">Kontrollerer adgang…</div>;
  if (!allowed) return <Navigate to="/henvendelser" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const item = await create.mutateAsync({
        contact_name: form.contact_name,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        address_text: form.address_text || null,
        channel: form.channel as InquiryChannel,
        category: form.category,
        description: form.description,
        priority: form.priority as InquiryPriority,
        assigned_to_id: form.assigned_to_id || null,
        follow_up_at: form.follow_up_at ? new Date(form.follow_up_at).toISOString() : null,
        notes: form.notes || null,
      });
      navigate(`/henvendelser/${item.id}`);
    } catch { /* Error is rendered below. */ }
  }

  return <div className="work-page">
    <Link className="back-link" to="/henvendelser">← Tilbage til henvendelser</Link>
    <header className="incident-page-heading"><div><span className="eyebrow">Ny kontakt</span><h1>Registrer henvendelse</h1><p>Registrer kontaktoplysninger, indhold og næste handling.</p></div></header>
    <form className="incident-create-form" onSubmit={submit}>
      <section className="form-section"><header><span>01</span><div><h2>Kontakt</h2><p>Så borgeren kan kontaktes igen.</p></div></header><div className="form-fields">
        <label className="field">Navn<input required value={form.contact_name} onChange={(event) => set("contact_name", event.target.value)} /></label>
        <label className="field">Adresse<input value={form.address_text} onChange={(event) => set("address_text", event.target.value)} /></label>
        <label className="field">Telefon<input type="tel" value={form.contact_phone} onChange={(event) => set("contact_phone", event.target.value)} /></label>
        <label className="field">E-mail<input type="email" value={form.contact_email} onChange={(event) => set("contact_email", event.target.value)} /></label>
        <label className="field">Kanal<select value={form.channel} onChange={(event) => set("channel", event.target.value)}>{Object.entries(inquiryChannelLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field">Kategori<select value={form.category} onChange={(event) => set("category", event.target.value)}>{Object.entries(inquiryCategoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </div></section>
      <section className="form-section"><header><span>02</span><div><h2>Henvendelsen</h2><p>Beskriv spørgsmålet og eventuelle interne oplysninger.</p></div></header><div className="form-fields">
        <label className="field field--wide">Beskrivelse<textarea required rows={6} value={form.description} onChange={(event) => set("description", event.target.value)} /></label>
        <label className="field field--wide">Interne noter<textarea rows={3} value={form.notes} onChange={(event) => set("notes", event.target.value)} /></label>
      </div></section>
      <section className="form-section"><header><span>03</span><div><h2>Opfølgning</h2><p>Sæt prioritet, ansvar og tidspunkt.</p></div></header><div className="form-fields">
        <label className="field">Prioritet<select value={form.priority} onChange={(event) => set("priority", event.target.value)}>{Object.entries(inquiryPriorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field">Ansvarlig<select value={form.assigned_to_id} onChange={(event) => set("assigned_to_id", event.target.value)}><option value="">Ikke tildelt</option>{users.data?.map((option) => <option value={option.id} key={option.id}>{option.display_name}</option>)}</select></label>
        <label className="field">Følg op<input type="datetime-local" value={form.follow_up_at} onChange={(event) => set("follow_up_at", event.target.value)} /></label>
      </div></section>
      {create.isError && <div className="form-error">{create.error.message}</div>}
      <footer className="form-actions"><Link className="secondary-button" to="/henvendelser">Annuller</Link><button className="primary-button" disabled={create.isPending}>Registrer henvendelse</button></footer>
    </form>
  </div>;
}
