import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/render";
import type { MapFeature } from "../types/map";
import { MapPage } from "./MapPage";

const valve = { type: "Feature", id: 7, geometry: { type: "Point", coordinates: [11.4, 55.6] }, properties: { id: "v1", code: "Hane øst" } } as MapFeature;
const area = { type: "Feature", id: 8, geometry: { type: "Polygon", coordinates: [[[11, 55], [12, 55], [12, 56], [11, 56], [11, 55]]] }, properties: { id: "a1", name: "Syntetisk område øst", valve_ids: ["v2", "v1"], closure_scenarios: [{ id: "sc1", name: "Luk området", area_ids: ["a1"], valve_ids: ["v1", "v2"], updated_at: "2026-08-11T10:00:00Z" }] } } as MapFeature;

vi.mock("../map/NetworkMap", () => ({
  NetworkMap: ({ onFeatureSelect, selectedValveIds, selectedClosureAreaIds }: { onFeatureSelect: (feature: MapFeature, kind: "valve" | "closureArea") => void; selectedValveIds: string[]; selectedClosureAreaIds: string[] }) => <div>
    <button type="button" onClick={() => onFeatureSelect(valve, "valve")}>Klik hane øst</button>
    <button type="button" onClick={() => onFeatureSelect(area, "closureArea")}>Klik område øst</button>
    <output aria-label="highlightede objekter">{[...selectedValveIds, ...selectedClosureAreaIds].join(",")}</output>
  </div>,
}));

it("toggler flere haner og områder og bygger handlingslinks", async () => {
  const empty = { type: "FeatureCollection", features: [] };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/auth/me") return Response.json({ id: "u1", display_name: "Mette", email: "m@example.dk", roles: ["admin"], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" });
    if (String(input) === "/api/app-settings/public") return Response.json({ organization_name: "GAVAD", organization_address: "", organization_locality: "", map_default_longitude: 12.28839, map_default_latitude: 55.966293, map_default_zoom: 14.5, updated_at: null });
    if (String(input) === "/api/closure-areas/a1/relations") return Response.json({ closure_area_id: "a1", valve_ids: ["v1", "v2"], scenarios: [{ id: "sc1", name: "Luk området", area_ids: ["a1"], valve_ids: ["v1", "v2"], updated_at: "2026-08-11T10:00:00Z" }], address_ids: [], candidate_address_ids: [] });
    return Response.json(empty);
  });
  vi.stubGlobal("fetch", fetchMock);
  const actor = userEvent.setup();
  renderApp(<MapPage />, ["/kort"]);
  await waitFor(() => expect(screen.queryByText("Indlæser kortdata…")).not.toBeInTheDocument());

  await actor.click(screen.getByRole("button", { name: "Klik hane øst" }));
  await actor.click(screen.getByRole("button", { name: "Klik område øst" }));
  expect(screen.getByRole("heading", { name: "Valgt i kortet" })).toBeInTheDocument();
  expect(screen.getByText("Syntetisk område øst")).toBeInTheDocument();
  expect(screen.getByText(/2 valgt/)).toBeInTheDocument();
  expect(screen.getByLabelText("highlightede objekter")).toHaveTextContent("v1,a1");
  const shutdown = screen.getByRole("link", { name: "Opret vandlukning" });
  expect(shutdown).toHaveAttribute("href", expect.stringContaining("valve_ids=v1"));
  expect(screen.getByRole("link", { name: "Opret hændelse" })).toHaveAttribute("href", expect.stringMatching(/lng=11\.4.*lat=55\.6.*place=Hane/));
  expect(screen.getByRole("button", { name: "Rediger koblinger" })).toBeInTheDocument();

  await actor.click(screen.getByRole("button", { name: "Rediger koblinger" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/closure-areas/a1/relations", expect.anything()));
  expect(fetchMock).not.toHaveBeenCalledWith("/api/closure-areas/8/relations", expect.anything());
  await actor.click(screen.getByRole("button", { name: "Luk relationredigering" }));

  await actor.click(screen.getByRole("button", { name: "Klik hane øst" }));
  expect(screen.queryByText("Hane øst")).not.toBeInTheDocument();
  expect(screen.getByText(/1 valgt/)).toBeInTheDocument();
});
