import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";
import { renderApp } from "../test/render";

it("bruger mørk tilstand som standard og kan skifte til lys", async () => {
  const user = userEvent.setup();
  renderApp(<ThemeToggle />);
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  await user.click(screen.getByRole("button", { name: /skift til lys/i }));
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
});
