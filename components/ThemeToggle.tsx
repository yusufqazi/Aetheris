"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";

function getThemeSnapshot(): ThemeMode {
  if (typeof document === "undefined") {
    return "dark";
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleThemeChange = () => callback();

  window.addEventListener("storage", handleThemeChange);
  window.addEventListener("aetheris-theme-change", handleThemeChange as EventListener);

  return () => {
    window.removeEventListener("storage", handleThemeChange);
    window.removeEventListener("aetheris-theme-change", handleThemeChange as EventListener);
  };
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new Event("aetheris-theme-change"));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, () => "dark");

  function handleToggle() {
    applyTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-sm)] transition duration-300 hover:border-[var(--accent-border)] hover:bg-[var(--panel-strong)]"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--panel-muted)] text-[var(--accent)]">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </span>
      <span className="hidden sm:inline">{theme} mode</span>
    </button>
  );
}
