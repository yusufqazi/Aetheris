export const THEME_STORAGE_KEY = "aetheris-theme";

export type ThemeMode = "dark" | "light";

export const THEME_INIT_SCRIPT = `
(() => {
  const storageKey = "${THEME_STORAGE_KEY}";
  const root = document.documentElement;

  try {
    const stored = window.localStorage.getItem(storageKey);
    const theme = stored === "light" || stored === "dark" ? stored : "dark";

    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  } catch {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  }
})();
`;
