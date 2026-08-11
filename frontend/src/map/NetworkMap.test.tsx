import { render } from "@testing-library/react";
import { NetworkMap } from "./NetworkMap";

const mapSpies = vi.hoisted(() => ({ addSource: vi.fn(), addLayer: vi.fn(), addControl: vi.fn(), remove: vi.fn(), jumpTo: vi.fn(), constructor: vi.fn() }));

vi.mock("maplibre-gl", () => {
  class Map {
    constructor(options: unknown) { mapSpies.constructor(options); }
    addSource = mapSpies.addSource;
    addLayer = mapSpies.addLayer;
    addControl = mapSpies.addControl;
    remove = mapSpies.remove;
    getSource = vi.fn();
    getLayer = vi.fn();
    setLayoutProperty = vi.fn();
    getCanvas = () => ({ style: { cursor: "" } });
    flyTo = vi.fn();
    jumpTo = mapSpies.jumpTo;
    on(event: string, layerOrHandler: string | (() => void)) {
      if (event === "load" && typeof layerOrHandler === "function") layerOrHandler();
      return this;
    }
  }
  return { Map, NavigationControl: class {}, AttributionControl: class {}, setWorkerUrl: vi.fn() };
});

describe("NetworkMap", () => {
  it("initialiserer GeoJSON-kilder og rydder MapLibre op", () => {
    const view = render(<NetworkMap layers={{ closureAreas: true, pipes: true, valves: true, addresses: true, plannedShutdowns: true, activeShutdowns: true, newIncidents: true, activeIncidents: true }} defaultLongitude={12.28839} defaultLatitude={55.966293} defaultZoom={14.5} onFeatureSelect={vi.fn()} />);
    expect(mapSpies.addSource).toHaveBeenCalledTimes(5);
    expect(mapSpies.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: "main-pipes" }));
    expect(mapSpies.addControl).toHaveBeenCalledTimes(2);
    expect(mapSpies.constructor).toHaveBeenCalledWith(expect.objectContaining({
      center: [12.28839, 55.966293],
      zoom: 14.5,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: false },
    }));
    expect(mapSpies.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: "planned-shutdowns" }));
    expect(mapSpies.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: "active-incidents" }));
    view.unmount();
    expect(mapSpies.remove).toHaveBeenCalledOnce();
  });
});
