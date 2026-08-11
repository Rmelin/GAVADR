import { screen } from "@testing-library/react";
import { renderApp } from "../test/render";
import { IncidentsPage } from "./IncidentsPage";

it("giver læsebrugeren adgang til listen uden mutationer", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/auth/me") return Response.json({ id: "u1", display_name: "Læser", email: "reader@example.dk", roles: ["reader"], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" });
    if (String(input) === "/api/incidents?status=new&status=assessing&status=active&status=monitoring") return Response.json([{ id: "i1", number: "HÆN-2026-0001", title: "Trykfald ved Skovkanten", type: "pressure_drop", priority: "high", status: "active", activity_type: "other_incident", location: { longitude: 11.45, latitude: 55.62 }, assigned_to: null, created_by: { id: "u1", display_name: "Læser", email: "reader@example.dk" }, registered_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" }]);
    return new Response(null, { status: 404 });
  }));
  renderApp(<IncidentsPage />, ["/haendelser"]);
  expect(await screen.findByText("Trykfald ved Skovkanten")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Registrer hændelse/ })).not.toBeInTheDocument();
});
