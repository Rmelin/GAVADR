import { fireEvent, render, screen } from "@testing-library/react";
import { LayerControls } from "./LayerControls";

describe("LayerControls", () => {
  it("slår kortlag til og fra uafhængigt", () => {
    const onChange = vi.fn();
    render(<LayerControls value={{ closureAreas: true, mainPipes: true, servicePipes: false, valves: false, addresses: false, plannedShutdowns: true, activeShutdowns: true, newIncidents: true, activeIncidents: true }} counts={{ mainPipes: 8, servicePipes: 4, activeIncidents: 2 }} onChange={onChange} />);

    expect(screen.getByLabelText(/Hovedledninger/)).toBeChecked();
    expect(screen.getByLabelText(/Stikledninger/)).not.toBeChecked();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Stikledninger/));
    expect(onChange).toHaveBeenCalledWith("servicePipes", true);
    fireEvent.click(screen.getByLabelText(/Haner/));
    expect(onChange).toHaveBeenCalledWith("valves", true);
    fireEvent.click(screen.getByLabelText(/Aktive hændelser/));
    expect(onChange).toHaveBeenCalledWith("activeIncidents", false);
  });
});
