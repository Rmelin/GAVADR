import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { renderApp } from "../test/render";

it("sender en bruger uden session til login", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "Ikke logget ind" }), { status: 401, headers: { "Content-Type": "application/json" } }));
  renderApp(<Routes><Route element={<ProtectedRoute />}><Route path="/" element={<h1>Hemmelig side</h1>} /></Route><Route path="/login" element={<h1>Log ind</h1>} /></Routes>);
  expect(await screen.findByRole("heading", { name: "Log ind" })).toBeInTheDocument();
  expect(screen.queryByText("Hemmelig side")).not.toBeInTheDocument();
  fetchMock.mockRestore();
});
