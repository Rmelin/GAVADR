import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/render";
import { CreatePlannedShutdownPage } from "./CreatePlannedShutdownPage";

const collection = (features: unknown[]) => ({ type: "FeatureCollection", features });

it("afleder område og adresse fra valgte haner og sender oprettelsen", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url === "/api/auth/me") return Response.json({ id: "u1", display_name: "Mette", email: "m@example.dk", roles: ["board_member"], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" });
    if (url === "/api/users/options") return Response.json([]);
    if (url === "/api/incidents") return Response.json([{ id: "i1", number: "HÆN-2026-0007", title: "Brud på Bøgevej", type: "confirmed_leak", priority: "high", status: "active", activity_type: "break", location: { longitude: 11, latitude: 55 }, created_by: { id: "u1", display_name: "Mette" }, registered_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" }]);
    if (url === "/api/valves") return Response.json(collection([{ type: "Feature", id: "v1", geometry: { type: "Point", coordinates: [11, 55] }, properties: { code: "H-101", status: "active" } }, { type: "Feature", id: "v2", geometry: { type: "Point", coordinates: [11.1, 55] }, properties: { code: "H-102", status: "active" } }]));
    if (url === "/api/closure-areas") return Response.json(collection([{ type: "Feature", id: "c1", geometry: { type: "MultiPolygon", coordinates: [] }, properties: { name: "Bøgevej nord", valve_ids: ["v1", "v2"], closure_scenarios: [{ id: "sc1", name: "Ringlukning", area_ids: ["c1"], valve_ids: ["v1", "v2"], updated_at: "2026-08-11T10:00:00Z" }], address_ids: ["a1"] } }]));
    if (url === "/api/addresses") return Response.json(collection([{ type: "Feature", id: "a1", geometry: { type: "Point", coordinates: [11, 55] }, properties: { street_name: "Bøgevej", house_number: "4", postal_code: "4690", city: "Haslev" } }]));
    if (url === "/api/pipes") return Response.json(collection([]));
    if (url === "/api/planned-shutdowns" && init?.method === "POST") return Response.json({ id: "s1" });
    return new Response(null, { status: 404 });
  }));
  const actor = userEvent.setup();
  renderApp(<CreatePlannedShutdownPage />, ["/vandlukninger/ny"]);
  await actor.type(await screen.findByLabelText("Titel"), "Udskiftning på Bøgevej");
  await actor.type(screen.getByLabelText("Beskrivelse"), "Hovedhanen skal udskiftes ved vejen.");
  fireEvent.change(screen.getByLabelText("Start"), { target: { value: "2026-08-10T08:00" } });
  fireEvent.change(screen.getByLabelText("Slut"), { target: { value: "2026-08-10T11:00" } });
  await actor.click(await screen.findByRole("checkbox", { name: /H-101/ }));
  expect(screen.getByText("Ingen komplette scenarier opfyldt")).toBeInTheDocument();
  await actor.click(await screen.findByRole("checkbox", { name: /H-102/ }));
  await actor.click(screen.getByRole("checkbox", { name: /HÆN-2026-0007 · Brud på Bøgevej/ }));
  expect(await screen.findByText("Bøgevej nord")).toBeInTheDocument();
  expect(screen.getByText(/Bøgevej 4/)).toBeInTheDocument();
  await actor.click(screen.getByRole("button", { name: "Opret vandlukning" }));
  await waitFor(() => expect(calls.some((call) => call.url === "/api/planned-shutdowns" && call.init?.method === "POST")).toBe(true));
  const payload = JSON.parse(String(calls.find((call) => call.url === "/api/planned-shutdowns" && call.init?.method === "POST")?.init?.body));
  expect(payload).toMatchObject({ title: "Udskiftning på Bøgevej", valve_ids: ["v1", "v2"], incident_ids: ["i1"] });
});

it("forvælger haner fra Ledningskortets query", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/auth/me") return Response.json({ id: "u1", display_name: "Mette", email: "m@example.dk", roles: ["board_member"], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" });
    if (url === "/api/users/options") return Response.json([]);
    if (url === "/api/valves") return Response.json(collection([{ type: "Feature", id: "v1", geometry: { type: "Point", coordinates: [11, 55] }, properties: { code: "H-101", status: "active" } }]));
    return Response.json(collection([]));
  }));
  renderApp(<CreatePlannedShutdownPage />, ["/vandlukninger/ny?source=map&valve_ids=v1"]);
  expect(await screen.findByRole("checkbox", { name: /H-101/ })).toBeChecked();
  expect(screen.getByText("Valgt i Ledningskortet")).toBeInTheDocument();
  expect(screen.getByText(/1 hane er forvalgt/)).toBeInTheDocument();
});
