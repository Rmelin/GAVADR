import { apiRequest } from "./client";

describe("apiRequest", () => {
  it("kalder API'et med cookies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await apiRequest("/health");
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.objectContaining({ credentials: "include" }));
    fetchMock.mockRestore();
  });

  it("viser FastAPI-valideringsfejl som læsbar tekst", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      detail: [{ type: "uuid_parsing", loc: ["body", "valve_ids", 0], msg: "Input should be a valid UUID" }],
    }, { status: 422 }));

    await expect(apiRequest("/planned-shutdowns")).rejects.toEqual(
      expect.objectContaining({ message: "Hane 1: Ugyldigt ID.", status: 422 }),
    );
  });

  it("bevarer tekstbaserede API-fejl", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ detail: "Hanen findes ikke" }, { status: 422 }));

    await expect(apiRequest("/planned-shutdowns")).rejects.toEqual(
      expect.objectContaining({ message: "Hanen findes ikke", status: 422 }),
    );
  });
});
