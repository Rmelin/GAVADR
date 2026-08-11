import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { AdminRoute } from "./AdminRoute";
import { renderApp } from "../test/render";

it("afviser en ikke-administrator på en direkte adminrute", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "u1", display_name: "Læser", email: "reader@example.dk", roles: ["reader"], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" })));
  renderApp(<Routes><Route path="/" element={<h1>Overblik</h1>} /><Route element={<AdminRoute />}><Route path="/brugere" element={<h1>Brugere</h1>} /></Route></Routes>, ["/brugere"]);
  expect(await screen.findByRole("heading", { name: "Overblik" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Brugere" })).not.toBeInTheDocument();
});
