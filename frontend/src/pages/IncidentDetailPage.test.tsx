import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/render";
import { IncidentDetailPage } from "./IncidentDetailPage";

const detail = { id: "i1", number: "HÆN-2026-0018", title: "Ledningsbrud", description: "Vand på kørebanen ved Bøgevej.", type: "confirmed_leak", priority: "high", status: "active", location: { longitude: 11.45, latitude: 55.62 }, assigned_to: null, created_by: { id: "u1", display_name: "Mette", email: "m@example.dk" }, registered_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z", expected_end_at: null, water_restored_at: null, public_text: null, updates: [], attachments: [] };

it("sender kommentar og status i samme opdatering", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url === "/api/auth/me") return Response.json({ id: "u1", display_name: "Mette", email: "m@example.dk", roles: ["board_member"], is_active: true, created_at: detail.registered_at, updated_at: detail.updated_at });
    if (url === "/api/users/options") return Response.json([]);
    if (url === "/api/incidents/i1") return Response.json(detail);
    if (url === "/api/incidents/i1/updates") return Response.json(detail);
    return new Response(null, { status: 404 });
  }));
  const actor = userEvent.setup();
  renderApp(<Routes><Route path="/haendelser/:incidentId" element={<IncidentDetailPage />} /></Routes>, ["/haendelser/i1"]);
  await screen.findByText("Vand på kørebanen ved Bøgevej.");
  await actor.type(screen.getByLabelText("Kommentar"), "Graveholdet er fremme.");
  await actor.selectOptions(screen.getByLabelText("Skift eventuelt status"), "monitoring");
  await actor.click(screen.getByRole("button", { name: "Tilføj opdatering" }));
  await waitFor(() => expect(calls.some((call) => call.url === "/api/incidents/i1/updates" && call.init?.method === "POST")).toBe(true));
  const call = calls.find((entry) => entry.url === "/api/incidents/i1/updates" && entry.init?.method === "POST")!;
  expect(JSON.parse(String(call.init?.body))).toEqual({ message: "Graveholdet er fremme.", status: "monitoring" });
});

it("viser adressen frem for koordinater når den findes", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/auth/me") return Response.json({ id: "u2", display_name: "Læser", email: "reader@example.dk", roles: ["reader"], is_active: true, created_at: detail.registered_at, updated_at: detail.updated_at });
    if (url === "/api/incidents/i1") return Response.json({ ...detail, address: { id: "a1", label: "Gadeledsvej 66A", street_name: "Gadeledsvej", house_number: "66A", postal_code: "4200", city: "Slagelse" } });
    return new Response(null, { status: 404 });
  }));
  renderApp(<Routes><Route path="/haendelser/:incidentId" element={<IncidentDetailPage />} /></Routes>, ["/haendelser/i1"]);
  await screen.findByText("Vand på kørebanen ved Bøgevej.");
  expect(screen.getByText("Placering").parentElement).toHaveTextContent("Gadeledsvej 66A");
  expect(screen.getByText("Placering").parentElement).toHaveTextContent("4200 Slagelse");
});

it("viser afledt aktivitetstype og link til tilknyttet vandlukning", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/auth/me") return Response.json({ id: "u2", display_name: "Læser", email: "reader@example.dk", roles: ["reader"], is_active: true, created_at: detail.registered_at, updated_at: detail.updated_at });
    if (url === "/api/incidents/i1") return Response.json({ ...detail, activity_type: "break", planned_shutdowns: [{ id: "s1", number: "LUK-2026-0001", title: "Akut lukning", status: "planned", starts_at: "2026-08-10T08:00:00Z", activity_type: "shutdown" }] });
    return new Response(null, { status: 404 });
  }));
  renderApp(<Routes><Route path="/haendelser/:incidentId" element={<IncidentDetailPage />} /></Routes>, ["/haendelser/i1"]);

  expect(await screen.findByText(/Brud · registreret/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /LUK-2026-0001 · Akut lukning/ })).toHaveAttribute("href", "/vandlukninger/s1");
});
