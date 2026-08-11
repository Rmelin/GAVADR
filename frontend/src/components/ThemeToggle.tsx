import { MoonIcon, SunIcon } from "./Icons";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "lys" : "mørk";
  return <button className="icon-button" type="button" onClick={toggleTheme} aria-label={`Skift til ${nextTheme} tilstand`} title={`Skift til ${nextTheme} tilstand`}>
    {theme === "dark" ? <SunIcon /> : <MoonIcon />}
  </button>;
}
