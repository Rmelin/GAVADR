import { screen, within } from "@testing-library/react";
import { renderApp } from "../test/render";
import { DashboardPage } from "./DashboardPage";

vi.mock("../map/DashboardOperationalMap", () => ({
  DashboardOperationalMap: ({ data }: { data: { features: Array<{ properties: { title: string } }> } }) => <div>{data.features.map((feature) => <span key={feature.properties.title}>{feature.properties.title}</span>)}</div>,
}));

it("viser live driftskort, auditaktiviteter og links til oversigterne", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/auth/me") return Response.json({ id: "u1", display_name: "Mette Jensen", email: "m@example.dk", roles: ["admin"], is_active: true, created_at: "2026-08-01T08:00:00Z", updated_at: "2026-08-01T08:00:00Z" });
    if (url === "/api/dashboard/map") return Response.json({ type: "FeatureCollection", features: [{ type: "Feature", id: "s1", geometry: { type: "Point", coordinates: [12.28, 55.96] }, properties: { id: "s1", kind: "shutdown", status: "planned", title: "Planlagt lukning" } }, { type: "Feature", id: "i1", geometry: { type: "Point", coordinates: [12.29, 55.97] }, properties: { id: "i1", kind: "incident", status: "new", title: "Ny hændelse" } }] });
    if (url === "/api/audit-logs?limit=5") return Response.json([{ id: "a1", actor_name: "Mette Jensen", action: "planned_shutdown.published", object_type: "planned_shutdown", object_id: "s1", object_number: "LUK-2026-0001", object_title: "Arbejde på Skovvej", starts_at: "2026-08-12T08:00:00Z", expected_end_at: "2026-08-12T11:00:00Z", created_at: new Date().toISOString() }]);
    if (url === "/api/public/driftsstatus") return Response.json({ updated_at: null, status: "normal_drift", items: [] });
    if (url === "/api/app-settings/public") return Response.json({ organization_name: "Gadevang", organization_address: "", organization_locality: "", map_default_longitude: 12.28, map_default_latitude: 55.96, map_default_zoom: 13, updated_at: null });
    return Response.json([]);
  }));

  renderApp(<DashboardPage />, ["/"]);

  const map = await screen.findByLabelText("Kort med aktuelle vandlukninger og hændelser");
  expect(await within(map).findByText("Planlagt lukning")).toBeInTheDocument();
  expect(within(map).getAllByText("Ny hændelse").length).toBeGreaterThan(0);
  const actor = await screen.findByText("Mette Jensen");
  expect(actor.parentElement?.parentElement).toHaveTextContent("Mette Jensen offentliggjorde en vandlukning");
  expect(actor.parentElement?.parentElement).toHaveTextContent("LUK-2026-0001 · Arbejde på Skovvej");
  expect(actor.parentElement?.parentElement).toHaveTextContent("Status blev sat til planlagt, og beskeden vises på /drift");
  expect(screen.queryByText("Thomas")).not.toBeInTheDocument();
  expect(screen.queryByText("Skovkanten")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Se alle →" }).map((link) => link.getAttribute("href"))).toEqual(["/haendelser", "/vandlukninger", "/henvendelser", "/kortrettelser"]);
});
