import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { renderApp } from "../test/render";
import { HistoryPage } from "./HistoryPage";

it("viser nøgletal, stedfilter, sagslink og filtreret eksport", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/history?")) return Response.json({
      items: [{ id: "s1", source: "planned_shutdown", category: "shutdown", number: "LUK-2026-0001", title: "Lukning på Åvej", status: "completed", occurred_at: "2026-08-01T08:00:00Z", expected_end_at: "2026-08-01T10:00:00Z", locations: ["Åvej 1, 4293 Dianalund"], affected_address_count: 4, href: "/vandlukninger/s1" }],
      summary: { total: 4, breaks: 1, shutdowns: 1, excavations: 1, other_incidents: 1 }, page: 1, page_size: 25, total_pages: 1,
    });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  renderApp(<Routes><Route path="/historik" element={<HistoryPage />} /></Routes>, ["/historik?from=2026-01-01&to=2026-08-11"]);

  expect(await screen.findByText("Lukning på Åvej")).toBeInTheDocument();
  expect(screen.getByText("4 berørte adresser")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Lukning på Åvej/ })).toHaveAttribute("href", "/vandlukninger/s1");
  expect(screen.getByRole("link", { name: /Eksportér CSV/ })).toHaveAttribute("href", "/api/history/export.csv?from=2026-01-01&to=2026-08-11");
  expect(screen.getByRole("heading", { name: "Andre hændelser" }).parentElement).toHaveTextContent("1");

  await userEvent.type(screen.getByRole("searchbox", { name: "Sted" }), "Åvej");
  expect(await screen.findByDisplayValue("Åvej")).toBeInTheDocument();
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("location=%C3%85vej"))).toBe(true));
});

it("læser flere aktivitetstyper fra URL og bruger dem i CSV", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [], summary: { total: 0, breaks: 0, shutdowns: 0, excavations: 0, other_incidents: 0 }, page: 1, page_size: 25, total_pages: 1 })));
  renderApp(<Routes><Route path="/historik" element={<HistoryPage />} /></Routes>, ["/historik?from=2026-01-01&to=2026-08-11&category=break&category=other_incident"]);

  expect(await screen.findByRole("button", { name: "Brud" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Andre hændelser" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("link", { name: /Eksportér CSV/ })).toHaveAttribute("href", "/api/history/export.csv?from=2026-01-01&to=2026-08-11&category=break&category=other_incident");
});
