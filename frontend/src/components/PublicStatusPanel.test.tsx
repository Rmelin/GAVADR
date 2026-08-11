import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/render";
import { PublicStatusPanel } from "./PublicStatusPanel";
import type { PublicStatus } from "../api/publicStatus";

const status: PublicStatus = {
  id: "p1",
  source_type: "incident",
  source_id: "i1",
  status: "draft",
  draft: {
    title: "Brud på Bøgevej",
    message: "Vi arbejder på at genetablere vandforsyningen.",
    areas: ["Bøgevej", "Skovkanten"],
    start_at: "2026-08-07T08:00:00Z",
    expected_end_at: "2026-08-07T11:00:00Z",
    severity: "high",
  },
  approved_payload: null,
  approved_by_id: null,
  approved_at: null,
  source_updated: false,
  needs_approval: false,
  close_message: null,
  closed_at: null,
  display_until: null,
  withdrawn_at: null,
  updated_at: "2026-08-07T08:00:00Z",
};

const initialDraft = { title: "", message: "", areas: [], start_at: "2026-08-07T08:00:00Z", expected_end_at: null, severity: "low" as const };

it("viser læseren den offentlige status uden redigerings- eller handlingsfelter", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...status, status: "published" })));
  renderApp(<PublicStatusPanel sourceType="incident" sourceId="i1" roles={["reader"]} initialDraft={initialDraft} />);

  expect(await screen.findByText("Aktuel driftsinformation")).toBeInTheDocument();
  expect(screen.getByText("Vi arbejder på at genetablere vandforsyningen.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Offentlig besked")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /offentliggør/i })).not.toBeInTheDocument();
});

it("gemmer alle kladdefelter og kræver eksplicit privatlivsbekræftelse før godkendelse", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (init?.method === "PUT") return Response.json({ ...status, draft: { ...status.draft, title: "Akut brud" } });
    if (url.endsWith("/approve")) return Response.json({ ...status, draft: { ...status.draft, title: "Akut brud" }, status: "published" });
    return Response.json(status);
  }));
  const actor = userEvent.setup();
  renderApp(<PublicStatusPanel sourceType="incident" sourceId="i1" roles={["board_member"]} initialDraft={initialDraft} />);

  const title = await screen.findByLabelText("Overskrift");
  await actor.clear(title);
  await actor.type(title, "Akut brud");
  expect(screen.getByText("Ikke-gemt kladde")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Godkend og offentliggør" })).toBeDisabled();
  await actor.click(screen.getByRole("button", { name: "Gem kladde" }));
  await waitFor(() => expect(calls.some((call) => call.init?.method === "PUT")).toBe(true));
  const saveCall = calls.find((call) => call.init?.method === "PUT")!;
  expect(saveCall.url).toBe("/api/public-status/incident/i1/draft");
  expect(JSON.parse(String(saveCall.init?.body))).toEqual({
    title: "Akut brud",
    message: status.draft.message,
    areas: status.draft.areas,
    start_at: status.draft.start_at,
    expected_end_at: status.draft.expected_end_at,
    severity: status.draft.severity,
  });

  await actor.click(screen.getByRole("button", { name: "Godkend og offentliggør" }));
  const dialog = screen.getByRole("dialog", { name: "Offentliggør denne status?" });
  const approve = within(dialog).getByRole("button", { name: "Godkend og offentliggør" });
  expect(approve).toBeDisabled();
  expect(calls.some((call) => call.url.endsWith("/approve"))).toBe(false);
  await actor.click(within(dialog).getByRole("checkbox"));
  await actor.click(approve);
  await waitFor(() => expect(calls.some((call) => call.url === "/api/public-status/incident/i1/approve" && call.init?.method === "POST")).toBe(true));
});

it("gemmer automatisk den første kladde før godkendelse", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (init?.method === "PUT") return Response.json(status);
    if (url.endsWith("/approve")) return Response.json({ ...status, status: "published" });
    return Response.json({ detail: "Not found" }, { status: 404 });
  }));
  const actor = userEvent.setup();
  renderApp(<PublicStatusPanel sourceType="incident" sourceId="i1" roles={["admin"]} initialDraft={status.draft} />);

  const openApproval = await screen.findByRole("button", { name: "Godkend og offentliggør" });
  expect(openApproval).toBeEnabled();
  await actor.click(openApproval);
  const dialog = screen.getByRole("dialog", { name: "Offentliggør denne status?" });
  await actor.click(within(dialog).getByRole("checkbox"));
  await actor.click(within(dialog).getByRole("button", { name: "Godkend og offentliggør" }));

  await waitFor(() => expect(calls.some((call) => call.url.endsWith("/approve"))).toBe(true));
  const mutationCalls = calls.filter((call) => call.init?.method === "PUT" || call.url.endsWith("/approve"));
  expect(mutationCalls.map((call) => [call.url, call.init?.method])).toEqual([
    ["/api/public-status/incident/i1/draft", "PUT"],
    ["/api/public-status/incident/i1/approve", "POST"],
  ]);
});

it("sender en obligatorisk afslutningsbesked", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/close")) return Response.json({ ...status, status: "closed", close_message: "Vandforsyningen er normal igen." });
    return Response.json({ ...status, status: "published" });
  }));
  const actor = userEvent.setup();
  renderApp(<PublicStatusPanel sourceType="incident" sourceId="i1" roles={["admin"]} initialDraft={initialDraft} />);

  await actor.click(await screen.findByRole("button", { name: "Afslut offentlig status" }));
  const dialog = screen.getByRole("dialog", { name: "Afslut offentlig status" });
  const confirm = within(dialog).getByRole("button", { name: "Bekræft afslutning" });
  expect(confirm).toBeDisabled();
  await actor.type(within(dialog).getByLabelText("Afslutningsbesked"), "Vandforsyningen er normal igen.");
  await actor.click(confirm);
  await waitFor(() => expect(calls.some((call) => call.url.endsWith("/close"))).toBe(true));
  const closeCall = calls.find((call) => call.url.endsWith("/close"))!;
  expect(closeCall.init?.method).toBe("POST");
  expect(JSON.parse(String(closeCall.init?.body))).toEqual({ message: "Vandforsyningen er normal igen.", display_until: null });
});

it("viser forældet-indikator og holder tilbagetrækning adskilt fra afslutning", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/withdraw")) return Response.json({ ...status, status: "withdrawn" });
    return Response.json({ ...status, status: "published", source_updated: true });
  }));
  const actor = userEvent.setup();
  renderApp(<PublicStatusPanel sourceType="incident" sourceId="i1" roles={["board_member"]} initialDraft={initialDraft} />);

  expect(await screen.findByText("Kilden er ændret siden godkendelsen")).toBeInTheDocument();
  await actor.click(screen.getByRole("button", { name: "Træk tilbage" }));
  const dialog = screen.getByRole("dialog", { name: "Træk status tilbage?" });
  expect(within(dialog).getByText(/Brug afslutning i stedet/)).toBeInTheDocument();
  await actor.click(within(dialog).getByRole("button", { name: "Ja, træk tilbage" }));
  await waitFor(() => expect(calls.some((call) => call.url === "/api/public-status/incident/i1/withdraw" && call.init?.method === "POST")).toBe(true));
  expect(calls.some((call) => call.url.endsWith("/close"))).toBe(false);
});

it("viser automatisk vandlukningsflow og tillader godkendelse af et tidligere sluttidspunkt", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url === "/api/app-settings/public") return Response.json({ organization_name: "Gadevang", organization_address: "", organization_locality: "", map_default_longitude: 12.28, map_default_latitude: 55.96, map_default_zoom: 13, updated_at: null });
    if (init?.method === "PUT") {
      const nextDraft = JSON.parse(String(init.body));
      return Response.json({ ...status, source_type: "shutdown", source_id: "s1", status: "published", draft: nextDraft, approved_payload: status.draft, needs_approval: true });
    }
    if (url.endsWith("/approve")) return Response.json({ ...status, source_type: "shutdown", source_id: "s1", status: "published", approved_payload: status.draft, needs_approval: false });
    return Response.json({ ...status, source_type: "shutdown", source_id: "s1", status: "published", approved_payload: status.draft });
  }));
  const actor = userEvent.setup();
  renderApp(<PublicStatusPanel sourceType="shutdown" sourceId="s1" roles={["admin"]} showSeverity={false} initialDraft={status.draft} />);

  expect(await screen.findByText("Sådan styres vandlukningen")).toBeInTheDocument();
  expect(screen.getByText(/Færdig før tid/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Afslut offentlig status" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Træk tilbage" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Forventet afsluttet"), { target: { value: "2026-08-07T10:00" } });
  await actor.click(screen.getByRole("button", { name: "Gem kladde" }));
  expect(await screen.findByRole("button", { name: "Godkend ny version" })).toBeInTheDocument();
  await actor.click(screen.getByRole("button", { name: "Godkend ny version" }));
  const dialog = screen.getByRole("dialog", { name: "Offentliggør denne status?" });
  await actor.click(within(dialog).getByRole("checkbox"));
  await actor.click(within(dialog).getByRole("button", { name: "Godkend og offentliggør" }));
  await waitFor(() => expect(calls.some((call) => call.url === "/api/public-status/shutdown/s1/approve")).toBe(true));
});
