import type { Preferences } from "@mendix/extensions-api";

// The data-theme value for a Studio Pro theme; null means light (no attribute).
export function themeAttribute(theme: Preferences["theme"]): "dark" | null {
  return theme === "Dark" ? "dark" : null;
}

// tokens.css switches on data-theme on <html>.
export function applyTheme(doc: Document, preferences: Preferences): void {
  const value = themeAttribute(preferences.theme);
  if (value === null) {
    doc.documentElement.removeAttribute("data-theme");
  } else {
    doc.documentElement.setAttribute("data-theme", value);
  }
  console.info(`theme applied: ${preferences.theme}`);
}
