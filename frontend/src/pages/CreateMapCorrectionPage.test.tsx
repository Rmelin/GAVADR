import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderApp } from "../test/render";
import { CreateMapCorrectionPage } from "./CreateMapCorrectionPage";

vi.mock("../incidents/IncidentPlacementMap", () => ({
  IncidentPlacementMap: ({ onChange }: { onChange: (longitude: number, latitude: number) => void }) => <button type="button" onClick={() => onChange(12.28839, 55.966293)}>Klik på testkort</button>,
}));

const requests: Array<{ url: string; init?: RequestInit }> = [];
const emptyMap = { type: "FeatureCollection", features: [] };

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === "/api/auth/me") return Response.json({ id: "u1", display_name: "Admin", email: "admin@example.dk", roles: ["admin"] });
    if (url === "/api/users/options" || url === "/api/suppliers/options") return Response.json([]);
    if (["/api/addresses", "/api/valves", "/api/pipes", "/api/closure-areas"].includes(url)) return Response.json(emptyMap);
    if (url === "/api/app-settings/public") return Response.json({ organization_name: "GAVAD", organization_address: "", organization_locality: "", map_default_longitude: 12.28, map_default_latitude: 55.96, map_default_zoom: 14, updated_at: null });
    if (url.startsWith("/api/map/search?")) return Response.json([{ id: "a1", type: "address", label: "Skovkæret 1", subtitle: "3400 Hillerød", longitude: 12.301, latitude: 55.971 }]);
    if (url === "/api/map-corrections" && init?.method === "POST") return Response.json({ id: "k1" });
    return new Response(null, { status: 404 });
  }));
});

async function fillDescription() {
  const actor = userEvent.setup();
  await actor.type(await screen.findByLabelText("Kort overskrift"), "Ny hovedstophane ved skolen");
  await actor.type(screen.getByLabelText("Hvad ved vi?"), "Hanen er sat, men endnu ikke indmålt.");
  await actor.click(screen.getByRole("button", { name: "Ny hovedstophane" }));
  return actor;
}

it("placerer som standard kortrettelsen med et klik i kortet", async () => {
  renderApp(<CreateMapCorrectionPage />, ["/kortrettelser/ny"]);
  const actor = await fillDescription();
  expect(screen.getByRole("button", { name: "Klik i kortet" })).toHaveClass("is-active");
  await actor.click(screen.getByRole("button", { name: "Klik på testkort" }));
  await actor.click(screen.getByRole("button", { name: "Opret kortrettelse" }));

  await waitFor(() => expect(requests.some((request) => request.url === "/api/map-corrections" && request.init?.method === "POST")).toBe(true));
  const request = requests.find((entry) => entry.url === "/api/map-corrections" && entry.init?.method === "POST")!;
  expect(JSON.parse(String(request.init?.body))).toMatchObject({
    category: "new_main_valve", longitude: 12.28839, latitude: 55.966293,
  });
});

it("kan bruge en kendt adresse som alternativ placering", async () => {
  renderApp(<CreateMapCorrectionPage />, ["/kortrettelser/ny"]);
  const actor = await fillDescription();
  await actor.click(screen.getByRole("button", { name: "Find adresse" }));
  await actor.type(screen.getByLabelText("Søg efter adresse"), "Skovkæret 1");
  await actor.click(await screen.findByRole("button", { name: /Skovkæret 1/ }));
  await actor.click(screen.getByRole("button", { name: "Opret kortrettelse" }));

  await waitFor(() => expect(requests.some((request) => request.url === "/api/map-corrections" && request.init?.method === "POST")).toBe(true));
  const request = requests.find((entry) => entry.url === "/api/map-corrections" && entry.init?.method === "POST")!;
  expect(JSON.parse(String(request.init?.body))).toMatchObject({ longitude: 12.301, latitude: 55.971 });
});
