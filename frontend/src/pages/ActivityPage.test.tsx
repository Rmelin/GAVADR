import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { renderApp } from "../test/render";
import { ActivityPage } from "./ActivityPage";

it("viser seneste login, revisionsspor og filtrerer på bruger", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/audit-logs/users") return Response.json([
      { id: "u1", display_name: "Mette Jensen", is_active: true, last_login_at: "2026-09-09T08:30:00Z" },
      { id: "u2", display_name: "Poul Hansen", is_active: true, last_login_at: null },
    ]);
    if (url.startsWith("/api/audit-logs/activity")) return Response.json({
      items: [{ id: "a1", actor_user_id: "u1", actor_name: "Mette Jensen", action: "login", object_type: "user", object_id: "u1", object_number: null, object_title: null, starts_at: null, expected_end_at: null, created_at: "2026-09-09T08:30:00Z" }],
      page: 1, page_size: 25, total: 1, total_pages: 1,
    });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  renderApp(<Routes><Route path="/aktivitet" element={<ActivityPage />} /></Routes>, ["/aktivitet"]);

  expect(await screen.findByRole("heading", { name: "Seneste login" })).toBeInTheDocument();
  expect(await screen.findByText("Aldrig logget ind")).toBeInTheDocument();
  expect(screen.getByText("Mette Jensen", { selector: ".activity-table strong" })).toBeInTheDocument();
  expect(screen.getByText("loggede ind")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Åbn sagshistorik" })).toHaveAttribute("href", "/historik");

  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Bruger" }), "u1");
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("actor_user_id=u1"))).toBe(true));
});
