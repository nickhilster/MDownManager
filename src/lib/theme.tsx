import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type ColorMode = "dark" | "light";
export type FontSize = "small" | "medium" | "large";

interface ThemeCtx {
  mode: ColorMode;
  fontSize: FontSize;
  setMode: (m: ColorMode) => void;
  setFontSize: (s: FontSize) => void;
}

const Ctx = createContext<ThemeCtx>({
  mode: "dark",
  fontSize: "medium",
  setMode: () => {},
  setFontSize: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(
    () => (localStorage.getItem("theme-mode") as ColorMode) ?? "dark"
  );
  const [fontSize, setFontSizeState] = useState<FontSize>(
    () => (localStorage.getItem("theme-font") as FontSize) ?? "medium"
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", mode === "light");
    localStorage.setItem("theme-mode", mode);
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("font-small", "font-medium", "font-large");
    root.classList.add(`font-${fontSize}`);
    localStorage.setItem("theme-font", fontSize);
  }, [fontSize]);

  const setMode = (m: ColorMode) => setModeState(m);
  const setFontSize = (s: FontSize) => setFontSizeState(s);

  return <Ctx.Provider value={{ mode, fontSize, setMode, setFontSize }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
