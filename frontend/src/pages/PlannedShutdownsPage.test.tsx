import { screen } from "@testing-library/react";
import { renderApp } from "../test/render";
import { PlannedShutdownsPage } from "./PlannedShutdownsPage";

it("viser vandlukninger for en læsebruger uden opret-handling", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/auth/me") return Response.json({ id: "u1", display_name: "Læser", email: "reader@example.dk", roles: ["reader"], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" });
    if (url === "/api/planned-shutdowns") return Response.json([{ id: "s1", number: "LUK-2026-0001", title: "Ventiludskiftning på Bøgevej", starts_at: "2026-08-10T08:00:00Z", expected_end_at: "2026-08-10T11:00:00Z", status: "planned", affected_address_count: 12, informed_address_count: 4, valve_count: 1, created_by: { id: "u1", display_name: "Læser" }, updated_at: "2026-08-07T08:00:00Z" }]);
    return new Response(null, { status: 404 });
  }));
  renderApp(<PlannedShutdownsPage />, ["/vandlukninger"]);
  expect(await screen.findByText("Ventiludskiftning på Bøgevej")).toBeInTheDocument();
  expect(screen.getByText("4 af 12 informeret")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Opret vandlukning/ })).not.toBeInTheDocument();
});
