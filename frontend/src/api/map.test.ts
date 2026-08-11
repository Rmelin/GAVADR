import { getAddresses, getClosureAreas, getNetworkSummary, getPipes, getValves, searchMap } from "./map";

describe("map API", () => {
  it("bruger de faste endpoints og sender sessionscookies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await Promise.all([getAddresses(), getValves(), getPipes(), getClosureAreas(), getNetworkSummary(), searchMap("Hane 7")]);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/addresses", "/api/valves", "/api/pipes", "/api/closure-areas", "/api/network-summary", "/api/map/search?q=Hane%207"]);
    fetchMock.mock.calls.forEach(([, init]) => expect(init).toEqual(expect.objectContaining({ credentials: "include" })));
    fetchMock.mockRestore();
  });
});
