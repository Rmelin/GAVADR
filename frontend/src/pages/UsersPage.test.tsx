import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/render";
import { UsersPage } from "./UsersPage";

const admin = { id: "u1", display_name: "Anna Admin", email: "admin@example.dk", roles: ["admin"], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" };
const reader = { id: "u2", display_name: "Rasmus Reader", email: "reader@example.dk", roles: ["reader"], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" };

it("opretter en bruger med valgte roller", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/auth/me") return Response.json(admin);
    if (String(input) === "/api/users" && init?.method === "POST") return Response.json({ ...reader, ...(JSON.parse(String(init.body)) as object) }, { status: 201 });
    if (String(input) === "/api/users") return Response.json([admin, reader]);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const actor = userEvent.setup();
  renderApp(<UsersPage />, ["/brugere"]);
  await screen.findByText("Rasmus Reader");
  await actor.click(screen.getByRole("button", { name: /Opret bruger/ }));
  await actor.type(screen.getByLabelText("E-mail"), "ny@example.dk");
  await actor.type(screen.getByLabelText("Visningsnavn"), "Ny Bruger");
  await actor.type(screen.getByLabelText(/^Midlertidig adgangskode/), "midlertidig kode 123");
  await actor.click(screen.getByRole("checkbox", { name: "Bestyrelsesmedlem" }));
  await actor.click(screen.getByRole("button", { name: "Opret bruger" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/users", expect.objectContaining({ method: "POST", body: expect.stringContaining("board_member") })));
});

it("bekræfter nulstilling uden at gengive adgangskoden", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input) === "/api/auth/me" ? Response.json(admin) : Response.json([admin, reader])));
  const actor = userEvent.setup();
  renderApp(<UsersPage />, ["/brugere"]);
  await screen.findByText("Rasmus Reader");
  const resetButtons = screen.getAllByRole("button", { name: "Nulstil adgangskode" });
  await actor.click(resetButtons[1]);
  const secret = "hemmelig kode 123";
  await actor.type(screen.getByLabelText(/^Ny midlertidig adgangskode/), secret);
  await actor.click(screen.getByRole("button", { name: "Fortsæt" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Nulstil adgangskode?");
  expect(screen.getByRole("dialog")).not.toHaveTextContent(secret);
});
