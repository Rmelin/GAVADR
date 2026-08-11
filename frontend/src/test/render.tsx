import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../components/ThemeProvider";
import { createQueryClient } from "../queryClient";
import type { ReactElement } from "react";

export function renderApp(ui: ReactElement, initialEntries = ["/"]) {
  const queryClient = createQueryClient();
  return render(<ThemeProvider><QueryClientProvider client={queryClient}><MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter></QueryClientProvider></ThemeProvider>);
}
