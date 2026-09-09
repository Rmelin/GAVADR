import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useAuth";
import { useUserOptions } from "../hooks/useIncidents";
import { useCreateInquiry } from "../hooks/useInquiries";
import { useMapSearch } from "../hooks/useMapData";
import { SingleSelectButtonGroup } from "../components/SingleSelectButtonGroup";
import { canMutateInquiries, inquiryCategoryLabels, inquiryChannelLabels, inquiryPriorityLabels, type InquiryChannel, type InquiryPriority } from "../types/inquiries";
import type { MapSearchResult } from "../types/map";

const initial = { contact_name: "", contact_email: "", contact_phone: "", channel: "phone", category: "other", priority: "medium", assigned_to_id: "", follow_up_at: "", description: "", notes: "" };

export function CreateInquiryPage() {
  const { data: user, isLoading } = useCurrentUser();
  const allowed = canMutateInquiries(user?.roles);
  const [form, setForm] = useState(initial);
  const [addressQuery, setAddressQuery] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<MapSearchResult>();
  const [addressError, setAddressError] = useState("");
  const create = useCreateInquiry();
  const users = useUserOptions(allowed);
  const addressSearch = useMapSearch(addressQuery);
  const navigate = useNavigate();
  const set = (key: keyof typeof initial, value: string) => setForm((current) => ({ ...current, [key]: value }));
  if (isLoading) return <div className="incident-state">Kontrollerer adgang…</div>;
  if (!allowed) return <Navigate to="/henvendelser" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedAddress) {
      setAddressError("Vælg en kendt adresse fra søgeresultaterne.");
      return;
    }
    try {
      const item = await create.mutateAsync({
        address_id: selectedAddress.id,
        contact_name: form.contact_name || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
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
    <header className="incident-page-heading"><div><span className="eyebrow">Ny kontakt</span><h1>Registrer henvendelse</h1><p>Start med adressen, og tilføj kontaktoplysninger hvis de er kendt.</p></div></header>
    <form className="incident-create-form" onSubmit={submit}>
      <section className="form-section"><header><span>01</span><div><h2>Adresse</h2><p>Henvendelsen knyttes til en kendt adresse fra ledningskortet.</p></div></header><div className="address-entry">
        <label className="field">Søg efter adresse<input value={addressQuery} onChange={(event) => { setAddressQuery(event.target.value); setSelectedAddress(undefined); setAddressError(""); }} placeholder="Skriv vejnavn og husnummer" autoComplete="off" aria-invalid={Boolean(addressError)} /></label>
        {addressError && <small className="field-error">{addressError}</small>}
        {addressQuery.trim().length >= 2 && !selectedAddress && <div className="address-search-results">{addressSearch.isLoading && <p className="address-search-state">Søger…</p>}{addressSearch.data?.filter((result) => result.type === "address").map((result) => <button type="button" key={result.id} onClick={() => { setSelectedAddress(result); setAddressQuery(`${result.label}, ${result.subtitle}`); setAddressError(""); }}>{result.label}<small>{result.subtitle}</small></button>)}{addressSearch.data && !addressSearch.data.some((result) => result.type === "address") && <p className="address-search-state">Ingen kendte adresser fundet.</p>}</div>}
        {selectedAddress && <div className="selected-address"><span><strong>{selectedAddress.label}</strong><small>{selectedAddress.subtitle}</small></span><button type="button" onClick={() => { setSelectedAddress(undefined); setAddressQuery(""); }}>Skift adresse</button></div>}
      </div></section>
      <section className="form-section"><header><span>02</span><div><h2>Kontakt</h2><p>Navn, telefon og e-mail er valgfrie.</p></div></header><div className="form-fields">
        <label className="field">Navn <small>(valgfri)</small><input value={form.contact_name} onChange={(event) => set("contact_name", event.target.value)} /></label>
        <label className="field">Telefon <small>(valgfri)</small><input type="tel" value={form.contact_phone} onChange={(event) => set("contact_phone", event.target.value)} /></label>
        <label className="field">E-mail <small>(valgfri)</small><input type="email" value={form.contact_email} onChange={(event) => set("contact_email", event.target.value)} /></label>
        <SingleSelectButtonGroup className="field--wide" label="Kanal" value={form.channel} onChange={(value) => set("channel", value)} options={Object.entries(inquiryChannelLabels).map(([value, label]) => ({ value, label }))} />
      </div></section>
      <section className="form-section"><header><span>03</span><div><h2>Henvendelsen</h2><p>Beskriv spørgsmålet og eventuelle interne oplysninger.</p></div></header><div className="form-fields">
        <SingleSelectButtonGroup className="field--wide" label="Kategori" value={form.category} onChange={(value) => set("category", value)} options={Object.entries(inquiryCategoryLabels).map(([value, label]) => ({ value, label }))} />
        <label className="field field--wide">Beskrivelse<textarea required rows={6} value={form.description} onChange={(event) => set("description", event.target.value)} /></label>
        <label className="field field--wide">Interne noter<textarea rows={3} value={form.notes} onChange={(event) => set("notes", event.target.value)} /></label>
      </div></section>
      <section className="form-section"><header><span>04</span><div><h2>Opfølgning</h2><p>Sæt prioritet, ansvar og tidspunkt.</p></div></header><div className="form-fields">
        <SingleSelectButtonGroup className="field--wide" label="Prioritet" value={form.priority} onChange={(value) => set("priority", value)} options={Object.entries(inquiryPriorityLabels).map(([value, label]) => ({ value, label }))} />
        <SingleSelectButtonGroup className="field--wide" label="Ansvarlig" value={form.assigned_to_id} onChange={(value) => set("assigned_to_id", value)} options={[{ value: "", label: "Ikke tildelt" }, ...(users.data?.map((option) => ({ value: option.id, label: option.display_name })) ?? [])]} />
        <label className="field">Følg op<input type="datetime-local" value={form.follow_up_at} onChange={(event) => set("follow_up_at", event.target.value)} /></label>
      </div></section>
      {create.isError && <div className="form-error">{create.error.message}</div>}
      <footer className="form-actions"><Link className="secondary-button" to="/henvendelser">Annuller</Link><button className="primary-button" disabled={create.isPending}>Registrer henvendelse</button></footer>
    </form>
  </div>;
}
