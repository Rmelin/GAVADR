import { fireEvent, render, screen } from "@testing-library/react";
import { LayerControls } from "./LayerControls";

describe("LayerControls", () => {
  it("slår kortlag til og fra uafhængigt", () => {
    const onChange = vi.fn();
    render(<LayerControls value={{ closureAreas: true, pipes: true, valves: false, addresses: false, plannedShutdowns: true, activeShutdowns: true, newIncidents: true, activeIncidents: true }} counts={{ pipes: 12, activeIncidents: 2 }} onChange={onChange} />);

    expect(screen.getByLabelText(/Ledninger/)).toBeChecked();
    expect(screen.getByText("12")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Haner/));
    expect(onChange).toHaveBeenCalledWith("valves", true);
    fireEvent.click(screen.getByLabelText(/Aktive hændelser/));
    expect(onChange).toHaveBeenCalledWith("activeIncidents", false);
  });
});
