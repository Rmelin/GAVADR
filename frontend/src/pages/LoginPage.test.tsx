import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { renderApp } from "../test/render";

it("logger ind og sender brugeren til overblikket", async () => {
  let authenticated = false;
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (input === "/api/auth/me" && !authenticated) return new Response(JSON.stringify({ detail: "Ikke logget ind" }), { status: 401, headers: { "Content-Type": "application/json" } });
    if (input === "/api/auth/me") return new Response(JSON.stringify({ id: "1", email: "drift@gavad.dk", display_name: "Mette Jensen", roles: ["board_member"], is_active: true, created_at: "2026-08-07T00:00:00Z", updated_at: "2026-08-07T00:00:00Z" }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (input === "/api/auth/login") {
      expect(init).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
      authenticated = true;
      return new Response(JSON.stringify({ access_token: "token", token_type: "bearer", expires_in: 1800 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Uventet kald: ${String(input)}`);
  });
  const user = userEvent.setup();
  renderApp(<Routes><Route path="/login" element={<LoginPage />} /><Route path="/" element={<h1>Overblik</h1>} /></Routes>, ["/login"]);
  await user.type(screen.getByLabelText("E-mail"), "drift@gavad.dk");
  await user.type(screen.getByLabelText("Adgangskode"), "hemmelig");
  await user.click(screen.getByRole("button", { name: "Log ind" }));
  expect(await screen.findByRole("heading", { name: "Overblik" })).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.anything()));
  fetchMock.mockRestore();
});

it("viser en tilgængelig fejl ved afvist login", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "Forkert login" }), { status: 401, headers: { "Content-Type": "application/json" } }));
  const user = userEvent.setup();
  renderApp(<Routes><Route path="/login" element={<LoginPage />} /></Routes>, ["/login"]);
  await user.type(screen.getByLabelText("E-mail"), "forkert@gavad.dk");
  await user.type(screen.getByLabelText("Adgangskode"), "forkert");
  await user.click(screen.getByRole("button", { name: "Log ind" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("E-mail eller adgangskode er forkert");
  fetchMock.mockRestore();
});
