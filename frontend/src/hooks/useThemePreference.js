import { useCallback, useEffect, useState } from "react";

export function useThemePreference(defaultTheme = "dark") {
  const [theme, setTheme] = useState(defaultTheme);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || defaultTheme;
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, [defaultTheme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
