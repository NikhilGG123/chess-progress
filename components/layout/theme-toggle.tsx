"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/button";

type Theme = "light" | "dark";

const STORAGE_KEY = "chess-progress-theme";

/**
 * Light or dark, nothing else. The system preference decides where a coach
 * starts, but from the first click the choice is theirs and it sticks.
 *
 * The stored value is also applied by an inline script in the root layout, so
 * the right theme is painted on the first frame. This only keeps them in step.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let initial: Theme;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      initial =
        stored === "dark" || stored === "light"
          ? stored
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    } catch {
      // Private windows and blocked site data both throw on read.
      initial = "light";
    }
    apply(initial);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    root.classList.toggle("light", next === "light");

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is no reason to refuse it.
    }
  }

  // Rendering the real state before mount would disagree with the server's
  // markup, so hold a same-sized placeholder for one frame. The min-width is
  // what makes it same-sized: without it the button rendered empty and then
  // jumped to the width of "Light", shifting the whole header on load.
  return (
    <button
      type="button"
      onClick={() => apply(theme === "dark" ? "light" : "dark")}
      aria-label={
        theme
          ? `${theme === "dark" ? "Dark" : "Light"} mode. Switch to ${theme === "dark" ? "light" : "dark"}.`
          : "Theme"
      }
      className={buttonClass("secondary", "sm", "min-w-[3.75rem]")}
    >
      {theme === "dark" ? "Dark" : theme === "light" ? "Light" : ""}
    </button>
  );
}
