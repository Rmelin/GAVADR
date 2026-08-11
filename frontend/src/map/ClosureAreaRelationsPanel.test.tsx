import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/render";
import type { MapFeature, MapFeatureCollection } from "../types/map";
import { ClosureAreaRelationsPanel } from "./ClosureAreaRelationsPanel";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  onSaved: vi.fn(),
  relations: { closure_area_id: "area-1", valve_ids: ["valve-1"], scenarios: [{ id: "scenario-1", name: "Luk hovedhane", area_ids: ["area-1"], valve_ids: ["valve-1"], updated_at: "2026-08-11T10:00:00Z" }], address_ids: [], candidate_address_ids: ["address-1"] },
}));
vi.mock("../hooks/useMapData", () => ({
  useClosureAreaRelations: () => ({
    query: { data: mocks.relations, isLoading: false, isError: false, refetch: vi.fn() },
    update: { mutateAsync: mocks.mutateAsync, isPending: false, isError: false },
  }),
}));

const area = { type: "Feature", id: "area-1", geometry: { type: "Polygon", coordinates: [] }, properties: { name: "Område nord" } } as MapFeature;
const valves = { type: "FeatureCollection", features: [{ type: "Feature", id: "valve-1", geometry: { type: "Point", coordinates: [12, 55] }, properties: { code: "H-101", status: "operational" } }] } as MapFeatureCollection;
const addresses = { type: "FeatureCollection", features: [{ type: "Feature", id: "address-1", geometry: { type: "Point", coordinates: [12, 55] }, properties: { street_name: "Bakkevej", house_number: "1", postal_code: "3400", city: "Hillerød" } }] } as MapFeatureCollection;

it("vælger polygonens adresser og gemmer relationerne", async () => {
  mocks.mutateAsync.mockResolvedValue({});
  const actor = userEvent.setup();
  renderApp(<ClosureAreaRelationsPanel area={area} valves={valves} addresses={addresses} onClose={vi.fn()} onSaved={mocks.onSaved} />);

  expect(screen.getByRole("link", { name: "Åbn lukkescenarier" })).toHaveAttribute("href", "/lukkescenarier?area=area-1");
  expect(screen.getByRole("checkbox", { name: /Bakkevej 1/ })).not.toBeChecked();
  await actor.click(screen.getByRole("button", { name: "Vælg alle i polygonen" }));
  await actor.click(screen.getByRole("button", { name: "Gem adresser" }));

  await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ address_ids: ["address-1"] }));
  expect(mocks.onSaved).toHaveBeenCalled();
});
