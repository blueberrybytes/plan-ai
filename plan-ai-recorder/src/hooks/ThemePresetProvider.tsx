import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { buildTheme, getStoredThemeId, storeThemeId } from "../theme";

interface ThemePresetContextValue {
  themeId: string;
  setThemeId: (id: string) => void;
}

const ThemePresetContext = createContext<ThemePresetContextValue | null>(null);

/**
 * Holds the color theme the user picked. The choice lives in localStorage, so
 * it applies before sign-in and stays after sign-out.
 */
export const ThemePresetProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [themeId, setThemeIdState] = useState<string>(getStoredThemeId);

  const setThemeId = useCallback((id: string) => {
    storeThemeId(id);
    setThemeIdState(id);
  }, []);

  const theme = useMemo(() => buildTheme(themeId), [themeId]);
  const value = useMemo(() => ({ themeId, setThemeId }), [themeId, setThemeId]);

  return (
    <ThemePresetContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemePresetContext.Provider>
  );
};

export const useThemePreset = (): ThemePresetContextValue => {
  const ctx = useContext(ThemePresetContext);
  if (!ctx)
    throw new Error("useThemePreset must be used inside ThemePresetProvider");
  return ctx;
};
