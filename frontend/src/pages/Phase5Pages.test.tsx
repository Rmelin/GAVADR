import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { renderApp } from "../test/render";
import { InquiriesPage } from "./InquiriesPage";
import { InquiryDetailPage } from "./InquiryDetailPage";
import { MapCorrectionDetailPage } from "./MapCorrectionDetailPage";
import { TasksPage } from "./TasksPage";

const reader = { id: "u1", display_name: "Læser", email: "reader@example.dk", roles: ["reader"], is_active: true, created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" };
const author = { id: reader.id, display_name: reader.display_name, email: reader.email };

it("viser henvendelser uden opret-handlinger for en læsebruger", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/auth/me") return Response.json(reader);
    if (String(input) === "/api/inquiries") return Response.json([{ id: "h1", number: "HEN-2026-0044", contact_name: "Anna Jensen", contact_email: null, contact_phone: null, address_id: null, address_text: "Skovvej 1", channel: "phone", category: "pressure", description: "Spørgsmål om vandtryk", priority: "high", status: "new", assigned_to: null, follow_up_at: null, incident_id: null, notes: null, created_by: author, updates: [], attachments: [], created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" }]);
    return new Response(null, { status: 404 });
  }));
  renderApp(<InquiriesPage />, ["/henvendelser"]);
  expect(await screen.findByText("Tryk og forsyning")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Registrer henvendelse/ })).not.toBeInTheDocument();
});

it("viser alle ni trin i kortrettelsens arbejdsgang", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/auth/me") return Response.json(reader);
    if (String(input) === "/api/map-corrections/k1") return Response.json({ id: "k1", number: "KOR-2026-0031", title: "Flyttet hovedhane", description: "Hanen er målt på ny placering.", category: "ventil", priority: "medium", status: "work_completed", location: { longitude: 11.45, latitude: 55.62 }, inquiry_id: null, pipe_id: null, valve_id: null, assigned_to: null, supplier: null, supplier_reference: null, supplier_due_at: null, created_by: author, history: [], attachments: [{ id: "a1", original_filename: "opmåling.png", mime_type: "image/png", size_bytes: 2048, download_url: "/api/map-corrections/k1/attachments/a1", created_at: "2026-08-07T08:00:00Z" }], created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" });
    return new Response(null, { status: 404 });
  }));
  renderApp(<Routes><Route path="/kortrettelser/:correctionId" element={<MapCorrectionDetailPage />} /></Routes>, ["/kortrettelser/k1"]);
  const workflow = await screen.findByRole("list", { name: "Kortrettelsens arbejdsgang" });
  expect(within(workflow).getAllByRole("listitem")).toHaveLength(9);
  expect(within(workflow).getByText("Arbejde udført").closest("li")).toHaveAttribute("aria-current", "step");
  expect(screen.getByRole("link", { name: /opmåling.png/ })).toHaveAttribute("href", "/api/map-corrections/k1/attachments/a1");
  expect(screen.queryByLabelText(/Tilføj fil/)).not.toBeInTheDocument();
});

it("validerer og uploader en fil på en henvendelse", async () => {
  const admin = { ...reader, roles: ["admin"] };
  const detail = { id: "h1", number: "HEN-2026-0044", contact_name: "Anna Jensen", contact_email: null, contact_phone: null, address_id: null, address_text: "Skovvej 1", channel: "phone", category: "pressure", description: "Spørgsmål om vandtryk", priority: "high", status: "new", assigned_to: null, follow_up_at: null, incident_id: null, notes: null, created_by: author, updates: [], attachments: [], created_at: "2026-08-07T08:00:00Z", updated_at: "2026-08-07T08:00:00Z" };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/auth/me") return Response.json(admin);
    if (String(input) === "/api/users/options") return Response.json([]);
    if (String(input) === "/api/inquiries/h1") return Response.json(detail);
    if (String(input) === "/api/inquiries/h1/attachments") return Response.json(detail);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const actor = userEvent.setup({ applyAccept: false });
  renderApp(<Routes><Route path="/henvendelser/:inquiryId" element={<InquiryDetailPage />} /></Routes>, ["/henvendelser/h1"]);
  await screen.findByText("Spørgsmål om vandtryk");
  const input = screen.getByLabelText(/Tilføj fil/);
  await actor.upload(input, new File(["plain text"], "note.txt", { type: "text/plain" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Vælg en JPG-, PNG- eller PDF-fil.");
  await actor.upload(input, new File(["%PDF-test"], "proof.pdf", { type: "application/pdf" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/inquiries/h1/attachments", expect.objectContaining({ method: "POST", body: expect.any(FormData) })));
});

it("sender dashboardfilteret for kun mine opgaver", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/auth/me") return Response.json(reader);
    if (String(input).startsWith("/api/tasks")) return Response.json([]);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  renderApp(<TasksPage />, ["/opgaver"]);
  await screen.findByText("0 opgaver");
  await userEvent.click(screen.getByRole("checkbox", { name: "Kun mine" }));
  expect(await screen.findByText("0 opgaver")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/tasks?mine=true", expect.any(Object));
});
