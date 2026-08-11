import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderApp } from "../test/render";
import { RoleRoute } from "./RoleRoute";

it.each(["admin", "map_manager"])("giver rollen %s adgang", async (role) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "u1", display_name: "Kortbruger", email: "map@example.dk", roles: [role], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" })));
  renderApp(<Routes><Route element={<RoleRoute allowedRoles={["admin", "map_manager"]} />}><Route path="/lukkescenarier" element={<h1>Lukkescenarier</h1>} /></Route></Routes>, ["/lukkescenarier"]);
  expect(await screen.findByRole("heading", { name: "Lukkescenarier" })).toBeInTheDocument();
});

it("sender læsebrugere tilbage til Overblik", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "u1", display_name: "Læser", email: "reader@example.dk", roles: ["reader"], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" })));
  renderApp(<Routes><Route path="/" element={<h1>Overblik</h1>} /><Route element={<RoleRoute allowedRoles={["admin", "map_manager"]} />}><Route path="/lukkescenarier" element={<h1>Lukkescenarier</h1>} /></Route></Routes>, ["/lukkescenarier"]);
  expect(await screen.findByRole("heading", { name: "Overblik" })).toBeInTheDocument();
});
