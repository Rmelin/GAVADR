import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/render";
import { automaticIncidentTitle, CreateIncidentPage } from "./CreateIncidentPage";

vi.mock("maplibre-gl", () => {
  class Map {
    addControl = vi.fn(); addSource = vi.fn(); addLayer = vi.fn(); remove = vi.fn(); jumpTo = vi.fn();
    on(event: string, handler: () => void) { if (event === "load") handler(); return this; }
  }
  class Marker { setLngLat() { return this; } addTo() { return this; } remove() {} }
  return { Map, Marker, NavigationControl: class {}, AttributionControl: class {}, setWorkerUrl: vi.fn() };
});

const user = { id: "u1", email: "drift@example.dk", display_name: "Mette Jensen", roles: ["board_member"], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" };
const emptyMap = { type: "FeatureCollection", features: [] };
const address = { id: "address-1", type: "address", label: "Gadeledsvej 66A", subtitle: "4200 Slagelse", longitude: 11.503, latitude: 55.541 };

function mockApi(requests: Array<{ url: string; init?: RequestInit }>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); requests.push({ url, init });
    if (url === "/api/auth/me") return Response.json(user);
    if (url === "/api/users/options") return Response.json([]);
    if (["/api/addresses", "/api/valves", "/api/pipes", "/api/closure-areas"].includes(url)) return Response.json(emptyMap);
    if (url.startsWith("/api/map/search?")) return Response.json([address]);
    if (url === "/api/incidents" && init?.method === "POST") return Response.json({ id: "incident-1" });
    return new Response(null, { status: 404 });
  }));
}

it("danner en redigerbar dansk titel", () => {
  expect(automaticIncidentTitle("confirmed_leak", "Gadeledsvej 66A", new Date("2026-08-08T12:00:00Z")))
    .toBe("Brud ud for Gadeledsvej 66A den 8. august 2026");
});

it("opretter på en valgt adresse med tom beskrivelse og automatisk titel", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  mockApi(requests);
  const actor = userEvent.setup();
  renderApp(<CreateIncidentPage />, ["/haendelser/ny"]);

  await actor.type(await screen.findByLabelText("Søg efter adresse"), "Gadeledsvej 66A");
  await actor.click(await screen.findByRole("button", { name: /Gadeledsvej 66A/ }));
  expect(screen.getByLabelText("Titel")).toHaveValue(automaticIncidentTitle("confirmed_leak", address.label));
  await actor.click(screen.getByRole("button", { name: "Registrer hændelse" }));

  await waitFor(() => expect(requests.some((request) => request.url === "/api/incidents" && request.init?.method === "POST")).toBe(true));
  const request = requests.find((entry) => entry.url === "/api/incidents" && entry.init?.method === "POST")!;
  expect(JSON.parse(String(request.init?.body))).toEqual({
    title: automaticIncidentTitle("confirmed_leak", address.label), description: "", type: "confirmed_leak",
    priority: "high", address_id: "address-1",
  });
});

it("bevarer en manuelt rettet titel og kan gendanne automatikken", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  mockApi(requests);
  const actor = userEvent.setup();
  renderApp(<CreateIncidentPage />, ["/haendelser/ny"]);

  await actor.type(await screen.findByLabelText("Søg efter adresse"), "Gadeledsvej");
  await actor.click(await screen.findByRole("button", { name: /Gadeledsvej 66A/ }));
  const title = screen.getByLabelText("Titel");
  await actor.clear(title);
  await actor.type(title, "Akut brud ved skolen");
  await actor.selectOptions(screen.getByLabelText("Type"), "pressure_drop");
  expect(title).toHaveValue("Akut brud ved skolen");
  await actor.click(screen.getByRole("button", { name: "Brug automatisk titel" }));
  expect(title).toHaveValue(automaticIncidentTitle("pressure_drop", address.label));
});

it("bevarer koordinat-payload som alternativ", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  mockApi(requests);
  const actor = userEvent.setup();
  renderApp(<CreateIncidentPage />, ["/haendelser/ny"]);

  await actor.click(await screen.findByRole("button", { name: "Angiv på kort" }));
  await actor.type(screen.getByLabelText("Titel"), "Brud ved Bøgevej");
  await actor.type(screen.getByLabelText("Længdegrad"), "11.456789");
  await actor.type(screen.getByLabelText("Breddegrad"), "55.623456");
  await actor.click(screen.getByRole("button", { name: "Registrer hændelse" }));

  await waitFor(() => expect(requests.some((request) => request.url === "/api/incidents" && request.init?.method === "POST")).toBe(true));
  const request = requests.find((entry) => entry.url === "/api/incidents" && entry.init?.method === "POST")!;
  expect(JSON.parse(String(request.init?.body))).toMatchObject({ description: "", longitude: 11.456789, latitude: 55.623456 });
});

it("starter i korttilstand med koordinater og redigerbar titel fra Ledningskortet", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  mockApi(requests);
  const actor = userEvent.setup();
  renderApp(<CreateIncidentPage />, ["/haendelser/ny?source=map&lng=11.45&lat=55.62&place=Syntetisk+omr%C3%A5de+%C3%B8st"]);

  expect(await screen.findByRole("button", { name: "Angiv på kort" })).toHaveClass("is-active");
  expect(screen.getByLabelText("Længdegrad")).toHaveValue("11.45");
  expect(screen.getByLabelText("Breddegrad")).toHaveValue("55.62");
  expect(screen.getByLabelText("Titel")).toHaveValue(automaticIncidentTitle("confirmed_leak", "Syntetisk område øst"));
  await actor.clear(screen.getByLabelText("Titel"));
  await actor.type(screen.getByLabelText("Titel"), "Brud i østligt område");
  expect(screen.getByLabelText("Titel")).toHaveValue("Brud i østligt område");
  expect(screen.getByText("Placering valgt i Ledningskortet")).toBeInTheDocument();
});
