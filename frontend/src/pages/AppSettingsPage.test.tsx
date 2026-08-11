import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/render";
import { AppSettingsPage } from "./AppSettingsPage";

vi.mock("../incidents/IncidentPlacementMap", () => ({
  IncidentPlacementMap: ({ onChange }: { onChange: (longitude: number, latitude: number) => void }) => <button type="button" onClick={() => onChange(12.2827594921, 55.9657118472)}>Vælg testpunkt</button>,
}));

it("henter gemte indstillinger i stedet for at beholde standardværdierne", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ organization_name: "Gadevang", organization_address: "Vandværksvej 2", organization_locality: "3400 Hillerød", map_default_longitude: 12.28839, map_default_latitude: 55.966293, map_default_zoom: 14.5, updated_at: "2026-08-10T10:00:00Z" })));
  renderApp(<AppSettingsPage />, ["/indstillinger"]);

  expect(await screen.findByDisplayValue("Gadevang")).toBeInTheDocument();
  expect(screen.getByLabelText("Adresse")).toHaveValue("Vandværksvej 2");
  expect(screen.getByLabelText("Lokalitet")).toHaveValue("3400 Hillerød");
  expect(screen.getByLabelText("Længdegrad")).toHaveValue(12.28839);
  expect(screen.getByLabelText("Breddegrad")).toHaveValue(55.966293);
  expect(screen.getByLabelText("Zoom")).toHaveValue(14.5);
});

it("gemmer branding og gennemfører CSV-import efter forhåndskontrol", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "/api/app-settings/public") return Response.json({ organization_name: "Original Vand", organization_address: "", organization_locality: "", map_default_longitude: 11.45, map_default_latitude: 55.62, map_default_zoom: 13, updated_at: null });
    if (url === "/api/app-settings" && init?.method === "PUT") return Response.json({ ...JSON.parse(String(init.body)), updated_at: "2026-08-10T10:00:00Z" });
    if (url === "/api/app-settings/address-import") {
      const commit = (init?.body as FormData).get("commit") === "true";
      return Response.json({ filename: "adresser.csv", rows: 1, new_rows: 1, skipped_rows: 0, created_rows: commit ? 1 : 0, errors: [], committed: commit });
    }
    return new Response(null, { status: 404 });
  }));
  const actor = userEvent.setup();
  renderApp(<AppSettingsPage />, ["/indstillinger"]);

  const name = await screen.findByDisplayValue("Original Vand");
  await actor.clear(name);
  await actor.type(name, "Dianalund Vand");
  await actor.type(screen.getByLabelText("Adresse"), "Vandværksvej 1");
  await actor.type(screen.getByLabelText("Lokalitet"), "4293 Dianalund");
  await actor.click(screen.getByRole("button", { name: "Vælg testpunkt" }));
  await actor.click(screen.getByRole("button", { name: "Gem indstillinger" }));
  await waitFor(() => expect(calls.some((call) => call.url === "/api/app-settings" && call.init?.method === "PUT")).toBe(true));
  expect(JSON.parse(String(calls.find((call) => call.url === "/api/app-settings" && call.init?.method === "PUT")?.init?.body))).toMatchObject({ organization_name: "Dianalund Vand", map_default_longitude: 12.282759, map_default_latitude: 55.965712, map_default_zoom: 13 });

  const file = new File(["adresse;postnummer;lokalitet;x;y\nGadeledsvej 66A;4293;Dianalund;654930;6169200\n"], "adresser.csv", { type: "text/csv" });
  await actor.upload(screen.getByLabelText("CSV-fil"), file);
  await actor.click(screen.getByRole("button", { name: "Kontrollér fil" }));
  expect(await screen.findByText("Klar til import")).toBeInTheDocument();
  await actor.click(screen.getByRole("button", { name: "Bekræft og importér" }));
  expect(await screen.findByText("Import gennemført")).toBeInTheDocument();
  const imports = calls.filter((call) => call.url === "/api/app-settings/address-import");
  expect((imports[0].init?.body as FormData).get("commit")).toBe("false");
  expect((imports[1].init?.body as FormData).get("commit")).toBe("true");
});
