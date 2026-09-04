import { useEffect, useState } from "react";

const STORAGE_KEY = "m7-sidebar-collapsed";

export function useAppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });

  return { mobileOpen, setMobileOpen, collapsed, toggleCollapsed };
}
