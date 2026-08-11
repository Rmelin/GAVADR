import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/render";
import type { MapFeature } from "../types/map";
import { ClosureScenariosPage } from "./ClosureScenariosPage";

const area = { type: "Feature", id: "a1", geometry: { type: "MultiPolygon", coordinates: [] }, properties: { id: "a1", name: "Ringvej nord" } } as MapFeature;
const secondArea = { type: "Feature", id: "a2", geometry: { type: "MultiPolygon", coordinates: [] }, properties: { id: "a2", name: "Ringvej syd" } } as MapFeature;
const valve = { type: "Feature", id: "v2", geometry: { type: "Point", coordinates: [12, 55] }, properties: { id: "v2", code: "H-102", status: "operational" } } as MapFeature;

vi.mock("../map/NetworkMap", () => ({
  NetworkMap: ({ onFeatureSelect, selectedValveIds, selectedClosureAreaIds }: { onFeatureSelect: (feature: MapFeature, kind: "valve") => void; selectedValveIds: string[]; selectedClosureAreaIds: string[] }) => <div aria-label="Test live kort"><button type="button" onClick={() => onFeatureSelect(valve, "valve")}>Klik H-102 i kort</button><output aria-label="Fremhævede scenarieområder">{selectedClosureAreaIds.join(",")}</output><output aria-label="Fremhævede scenariehaner">{selectedValveIds.join(",")}</output></div>,
}));

it("redigerer ringlogik øverst og fremhæver hanerne live på kortet", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const empty = { type: "FeatureCollection", features: [] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url === "/api/app-settings/public") return Response.json({ organization_name: "GAVAD", organization_address: "", organization_locality: "", map_default_longitude: 12.28, map_default_latitude: 55.96, map_default_zoom: 13, updated_at: null });
    if (url === "/api/closure-areas") return Response.json({ type: "FeatureCollection", features: [area, secondArea] });
    if (url === "/api/valves") return Response.json({ type: "FeatureCollection", features: [{ type: "Feature", id: "v1", geometry: { type: "Point", coordinates: [12, 55] }, properties: { id: "v1", code: "H-101", status: "operational" } }, valve] });
    if (url === "/api/closure-scenarios/s1" && init?.method === "PUT") return Response.json({ id: "s1", name: "Begge ender", area_ids: ["a1", "a2"], valve_ids: ["v1", "v2"], updated_at: "2026-08-11T10:01:00Z" });
    if (url === "/api/closure-scenarios") return Response.json([{ id: "s1", name: "Begge ender", area_ids: ["a1", "a2"], valve_ids: ["v1"], updated_at: "2026-08-11T10:00:00Z" }]);
    return Response.json(empty);
  }));
  const actor = userEvent.setup();
  renderApp(<ClosureScenariosPage />, ["/lukkescenarier?area=a1"]);

  await actor.click(await screen.findByRole("button", { name: /Begge ender/ }));
  expect(screen.getByDisplayValue("Begge ender")).toBeInTheDocument();
  const editor = screen.getByLabelText("Rediger lukkescenarier");
  const liveMap = screen.getByLabelText("Test live kort");
  expect(editor.compareDocumentPosition(liveMap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: /Ringvej syd/ })).toBeChecked();
  expect(screen.getByLabelText("Fremhævede scenarieområder")).toHaveTextContent("a1,a2");
  expect(screen.getByLabelText("Fremhævede scenariehaner")).toHaveTextContent("v1");

  await actor.click(screen.getByRole("button", { name: "Klik H-102 i kort" }));
  expect(screen.getByLabelText("Fremhævede scenariehaner")).toHaveTextContent("v1,v2");
  expect(screen.getByRole("checkbox", { name: /H-102/ })).toBeChecked();
  await actor.click(screen.getByRole("button", { name: "Gem lukkescenarie" }));

  await waitFor(() => expect(calls.some((call) => call.url === "/api/closure-scenarios/s1" && call.init?.method === "PUT")).toBe(true));
  const saved = JSON.parse(String(calls.find((call) => call.url === "/api/closure-scenarios/s1" && call.init?.method === "PUT")?.init?.body));
  expect(saved).toEqual({ name: "Begge ender", area_ids: ["a1", "a2"], valve_ids: ["v1", "v2"], expected_updated_at: "2026-08-11T10:00:00Z" });
});
