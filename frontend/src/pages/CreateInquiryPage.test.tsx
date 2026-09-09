import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderApp } from "../test/render";
import { CreateInquiryPage } from "./CreateInquiryPage";

const calls: Array<{ url: string; init?: RequestInit }> = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "/api/auth/me") return Response.json({ id: "u1", display_name: "Admin", email: "admin@example.dk", roles: ["admin"] });
    if (url === "/api/users/options") return Response.json([]);
    if (url.startsWith("/api/map/search?")) return Response.json([{ id: "a1", type: "address", label: "Bøgevej 4", subtitle: "4293 Dianalund", longitude: 11, latitude: 55 }]);
    if (url === "/api/inquiries" && init?.method === "POST") return Response.json({ id: "h1" });
    return Response.json({});
  }));
});

it("registrerer en henvendelse på en kendt adresse med valgknapper", async () => {
  const user = userEvent.setup();
  renderApp(<CreateInquiryPage />, ["/henvendelser/ny"]);

  await user.type(await screen.findByLabelText("Søg efter adresse"), "Bøgevej 4");
  await user.click(await screen.findByRole("button", { name: "Bøgevej 4 4293 Dianalund" }));
  await user.click(screen.getByRole("button", { name: "E-mail" }));
  await user.click(screen.getByRole("button", { name: "Vandkvalitet" }));
  await user.click(screen.getByRole("button", { name: "Høj" }));
  await user.type(screen.getByLabelText("Beskrivelse"), "Vandet smager anderledes");
  await user.click(screen.getByRole("button", { name: "Registrer henvendelse" }));

  await waitFor(() => expect(calls.some((call) => call.url === "/api/inquiries" && call.init?.method === "POST")).toBe(true));
  const request = calls.find((call) => call.url === "/api/inquiries" && call.init?.method === "POST")!;
  expect(JSON.parse(String(request.init?.body))).toMatchObject({
    address_id: "a1", contact_name: null, contact_email: null, contact_phone: null,
    channel: "email", category: "water_quality", priority: "high",
  });
});
