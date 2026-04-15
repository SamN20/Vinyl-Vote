import { useCallback, useEffect, useState } from "react";

function getInitialTheme(defaultTheme) {
  if (typeof document !== "undefined") {
    const attrTheme = document.documentElement.getAttribute("data-theme");
    if (attrTheme === "dark" || attrTheme === "light") {
      return attrTheme;
    }
  }

  if (typeof window !== "undefined") {
    try {
      const savedTheme = window.localStorage.getItem("theme");
      if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
      }
    } catch {
      return defaultTheme;
    }
  }

  return defaultTheme;
}

export function useThemePreference(defaultTheme = "dark") {
  const [theme, setTheme] = useState(() => getInitialTheme(defaultTheme));

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem("theme", theme);
    } catch {
      // Ignore storage failures (private mode / disabled storage)
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
