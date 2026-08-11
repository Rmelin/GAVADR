import { act, fireEvent, render, screen } from "@testing-library/react";
import { useMapSearch } from "../hooks/useMapData";
import { MapSearch } from "./MapSearch";

vi.mock("../hooks/useMapData", () => ({ useMapSearch: vi.fn() }));

const useMapSearchMock = vi.mocked(useMapSearch);

describe("MapSearch", () => {
  afterEach(() => vi.useRealTimers());

  it("debouncer søgningen og vælger et resultat", () => {
    vi.useFakeTimers();
    useMapSearchMock.mockImplementation((query) => ({
      data: query === "Gade" ? [{ id: "a-1", type: "address", label: "Gade 1", subtitle: "4700 Næstved", longitude: 11.8, latitude: 55.2 }] : undefined,
      isFetching: false,
      isError: false,
      isSuccess: query === "Gade",
    }) as ReturnType<typeof useMapSearch>);
    const onSelect = vi.fn();
    render(<MapSearch onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText("Søg i kortet"), { target: { value: "Gade" } });
    expect(useMapSearchMock).toHaveBeenLastCalledWith("");
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole("option", { name: /Gade 1/ }));

    expect(useMapSearchMock).toHaveBeenLastCalledWith("Gade");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a-1" }));
  });
});
