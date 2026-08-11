import { Route, Routes } from "react-router-dom";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/render";
import { PlannedShutdownDetailPage } from "./PlannedShutdownDetailPage";

const detail = { id: "s1", number: "LUK-2026-0001", title: "Udskiftning", description: "Planlagt udskiftning af hovedhane.", starts_at: "2026-08-10T08:00:00Z", expected_end_at: "2026-08-10T11:00:00Z", status: "planned", activity_type: "shutdown", affected_address_count: 1, informed_address_count: 0, valve_count: 1, created_by: { id: "u1", display_name: "Mette" }, updated_at: "2026-08-07T08:00:00Z", valves: [{ id: "v1", code: "H-101" }], closure_areas: [{ id: "c1", name: "Bøgevej nord" }], addresses: [{ id: "a1", street_name: "Bøgevej", house_number: "4", postal_code: "4690", city: "Haslev", included: true, informed: false, source: "derived" }], incidents: [] };

it("kan markere en enkelt adresse som informeret", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url === "/api/auth/me") return Response.json({ id: "u1", display_name: "Mette", email: "m@example.dk", roles: ["board_member"], is_active: true, created_at: detail.updated_at, updated_at: detail.updated_at });
    if (url === "/api/planned-shutdowns/s1") return Response.json(detail);
    if (url === "/api/public-status/shutdown/s1") return new Response(null, { status: 404 });
    if (url === "/api/planned-shutdowns/s1/addresses/a1") return Response.json({ ...detail, addresses: [{ ...detail.addresses[0], informed: true }] });
    return new Response(null, { status: 404 });
  }));
  const actor = userEvent.setup();
  renderApp(<Routes><Route path="/vandlukninger/:shutdownId" element={<PlannedShutdownDetailPage />} /></Routes>, ["/vandlukninger/s1"]);
  await actor.click(await screen.findByRole("checkbox", { name: /Nej/ }));
  expect(calls.some((call) => call.url === "/api/public-status/shutdown/s1")).toBe(true);
  await waitFor(() => expect(calls.some((call) => call.url === "/api/planned-shutdowns/s1/addresses/a1" && call.init?.method === "PATCH")).toBe(true));
  const call = calls.find((entry) => entry.url === "/api/planned-shutdowns/s1/addresses/a1" && entry.init?.method === "PATCH")!;
  expect(JSON.parse(String(call.init?.body))).toEqual({ informed: true });
});

it("viser automatisk status og tillader kun aflysning før start", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let currentDetail = { ...detail, starts_at: "2099-08-10T08:00:00Z", expected_end_at: "2099-08-10T11:00:00Z" };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url === "/api/auth/me") return Response.json({ id: "u1", display_name: "Mette", email: "m@example.dk", roles: ["board_member"], is_active: true, created_at: detail.updated_at, updated_at: detail.updated_at });
    if (url === "/api/public-status/shutdown/s1") return new Response(null, { status: 404 });
    if (url === "/api/planned-shutdowns/s1" && init?.method === "PATCH") currentDetail = { ...currentDetail, status: "cancelled" };
    return Response.json(currentDetail);
  }));
  const actor = userEvent.setup();
  renderApp(<Routes><Route path="/vandlukninger/:shutdownId" element={<PlannedShutdownDetailPage />} /></Routes>, ["/vandlukninger/s1"]);

  expect(await screen.findByText("Nuværende status")).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
  const start = await screen.findByLabelText("Starter");
  expect(screen.queryByLabelText("Alvorlighed")).not.toBeInTheDocument();
  fireEvent.change(start, { target: { value: "2026-08-10T12:30" } });
  const expectedStart = new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeStyle: "short" }).format(new Date("2026-08-10T12:30"));
  expect(within(screen.getByLabelText("Præcis offentlig forhåndsvisning")).getByText(expectedStart)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Start vandlukning" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Afslut vandlukning" })).not.toBeInTheDocument();
  expect(screen.getByText("Status skifter automatisk efter start- og sluttidspunktet.")).toBeInTheDocument();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await actor.click(screen.getByRole("button", { name: "Aflys vandlukning" }));
  await waitFor(() => expect(calls.some((call) => call.url === "/api/planned-shutdowns/s1" && call.init?.method === "PATCH")).toBe(true));
  const call = calls.find((entry) => entry.url === "/api/planned-shutdowns/s1" && entry.init?.method === "PATCH")!;
  expect(JSON.parse(String(call.init?.body))).toEqual({ status: "cancelled" });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Aflys vandlukning" })).not.toBeInTheDocument());
});

it("viser læseadgang uden adressehandlinger", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/auth/me") return Response.json({ id: "u2", display_name: "Læser", email: "l@example.dk", roles: ["reader"], is_active: true, created_at: detail.updated_at, updated_at: detail.updated_at });
    if (url === "/api/public-status/shutdown/s1") return new Response(null, { status: 404 });
    return Response.json(detail);
  }));
  renderApp(<Routes><Route path="/vandlukninger/:shutdownId" element={<PlannedShutdownDetailPage />} /></Routes>, ["/vandlukninger/s1"]);
  expect(await screen.findByText("Nuværende status")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Udelad" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Tilføj adresse manuelt")).not.toBeInTheDocument();
});

it("lader bestyrelsen redigere tilknyttede hændelser med PUT", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url === "/api/auth/me") return Response.json({ id: "u1", display_name: "Mette", email: "m@example.dk", roles: ["board_member"], is_active: true, created_at: detail.updated_at, updated_at: detail.updated_at });
    if (url === "/api/incidents") return Response.json([{ id: "i1", number: "HÆN-2026-0007", title: "Brud på Bøgevej", type: "confirmed_leak", priority: "high", status: "active", activity_type: "break", location: { longitude: 11, latitude: 55 }, created_by: { id: "u1", display_name: "Mette" }, registered_at: detail.updated_at, updated_at: detail.updated_at }]);
    if (url === "/api/public-status/shutdown/s1") return new Response(null, { status: 404 });
    return Response.json(detail);
  }));
  const actor = userEvent.setup();
  renderApp(<Routes><Route path="/vandlukninger/:shutdownId" element={<PlannedShutdownDetailPage />} /></Routes>, ["/vandlukninger/s1"]);

  await actor.click(await screen.findByRole("checkbox", { name: /HÆN-2026-0007 · Brud på Bøgevej/ }));
  await actor.click(screen.getByRole("button", { name: "Gem tilknytninger" }));
  await waitFor(() => expect(calls.some((call) => call.url === "/api/planned-shutdowns/s1/incidents" && call.init?.method === "PUT")).toBe(true));
  const call = calls.find((entry) => entry.url === "/api/planned-shutdowns/s1/incidents" && entry.init?.method === "PUT")!;
  expect(JSON.parse(String(call.init?.body))).toEqual({ incident_ids: ["i1"] });
});
