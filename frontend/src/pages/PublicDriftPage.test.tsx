import { screen } from "@testing-library/react";
import { renderApp } from "../test/render";
import { PublicDriftPage } from "./PublicDriftPage";

const appSettings = { organization_name: "Gadevang", organization_address: "", organization_locality: "", map_default_longitude: 12.28839, map_default_latitude: 55.966293, map_default_zoom: 13, updated_at: null };
const mockPublicApi = (feed: object) => vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
  Response.json(String(input) === "/api/app-settings/public" ? appSettings : feed));

it("viser normal drift offentligt uden login", async () => {
  const fetchMock = mockPublicApi({
    updated_at: null,
    status: "normal_drift",
    items: [],
  });

  renderApp(<PublicDriftPage />, ["/drift"]);

  expect(await screen.findByRole("heading", { name: "Vandforsyningen kører normalt" })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/public/driftsstatus", expect.objectContaining({ credentials: "include" }));
  expect(screen.getByText("Offentlig driftsinformation")).toBeInTheDocument();
});

it("viser planlagt arbejde og kan bruges uden sidehoved i en iframe", async () => {
  mockPublicApi({
    updated_at: "2026-08-09T08:00:00Z",
    status: "planlagt_arbejde",
    items: [{
      source_type: "shutdown",
      resolved: false,
      active_now: false,
      title: "Udskiftning af hovedhane",
      message: "Vandet lukkes kortvarigt under arbejdet.",
      areas: ["Gadeledsvej"],
      start_at: "2099-08-10T08:00:00Z",
      expected_end_at: "2099-08-10T11:00:00Z",
      severity: "medium",
      updated_at: "2026-08-09T08:00:00Z",
    }],
  });

  renderApp(<PublicDriftPage />, ["/drift?embed=1"]);

  expect(await screen.findByRole("heading", { name: "Driften er normal nu" })).toBeInTheDocument();
  expect(screen.getByText("Der er planlagt arbejde")).toBeInTheDocument();
  expect(screen.getByText("Der er 1 planlagt arbejde senere. Se tidspunkt og berørt område nedenfor.")).toBeInTheDocument();
  expect(screen.getByText("Planlagt arbejde")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Udskiftning af hovedhane" })).toBeInTheDocument();
  expect(screen.queryByText("Offentlig driftsinformation")).not.toBeInTheDocument();
});

it("fremhæver en vandlukning som aktiv inden for tidsrummet", async () => {
  mockPublicApi({
    updated_at: "2026-08-09T08:00:00Z",
    status: "driftsforstyrrelse",
    items: [{
      source_type: "shutdown",
      resolved: false,
      active_now: true,
      title: "Aktiv lukning på Gadeledsvej",
      message: "Vandet er midlertidigt lukket.",
      areas: ["Gadeledsvej"],
      start_at: "2026-08-09T07:00:00Z",
      expected_end_at: "2099-08-09T10:00:00Z",
      severity: "high",
      updated_at: "2026-08-09T08:00:00Z",
    }],
  });

  renderApp(<PublicDriftPage />, ["/drift"]);

  expect(await screen.findByRole("heading", { name: "Der er en aktuel vandlukning" })).toBeInTheDocument();
  expect(screen.getByText("Vandlukningen er aktiv nu")).toBeInTheDocument();
  expect(screen.getByText("Aktiv vandlukning")).toBeInTheDocument();
});
