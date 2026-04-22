import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    const initial = stored ?? "dark";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return (
    <button
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
      aria-label="Toggle theme"
      className="relative h-8 w-8 flex items-center justify-center rounded-full glass-subtle hover:bg-white/12 transition-all duration-300 group"
    >
      <span className="absolute inset-0 rounded-full ring-1 ring-white/10 group-hover:ring-white/20 transition-all duration-300" />
      {theme === "light" ? (
        <Moon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors duration-200" />
      ) : (
        <Sun className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors duration-200" />
      )}
    </button>
  );
}
