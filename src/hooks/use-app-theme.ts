import { useEffect, useState } from "react";

export type AppTheme = "dark" | "light";

const THEME_KEY = "app-theme";
const LEGACY_CRM_THEME_KEY = "crm-theme";
const THEME_EVENT = "app-theme-change";

function storedTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  const value = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_CRM_THEME_KEY);
  return value === "light" ? "light" : "dark";
}

function applyTheme(theme: AppTheme) {
  document.documentElement.classList.toggle("app-light", theme === "light");
  document.body?.classList.toggle("dark", theme === "dark");
}

export function useAppTheme() {
  const [theme, setThemeState] = useState<AppTheme>("dark");

  useEffect(() => {
    const syncTheme = () => {
      const next = storedTheme();
      applyTheme(next);
      setThemeState(next);
    };

    syncTheme();
    window.addEventListener(THEME_EVENT, syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener(THEME_EVENT, syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  const setTheme = (next: AppTheme) => {
    localStorage.setItem(THEME_KEY, next);
    localStorage.removeItem(LEGACY_CRM_THEME_KEY);
    applyTheme(next);
    setThemeState(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return {
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
  };
}
