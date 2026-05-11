import React, { createContext, useContext, useEffect, useState } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import { THEMES, AppThemeName } from '../theme/Theme';

interface AppThemeContextType {
  activeThemeName: AppThemeName;
  setTheme: (name: AppThemeName) => void;
  activeTheme: typeof THEMES['blueberry'];
}

export const AppThemeContext = createContext<AppThemeContextType>({
  activeThemeName: 'blueberry',
  setTheme: () => {},
  activeTheme: THEMES.blueberry,
});

export const AppThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeThemeName, setActiveThemeName] = useState<AppThemeName>('blueberry');

  useEffect(() => {
    // Load theme from file system
    const loadTheme = async () => {
      try {
        const themeFile = new File(Paths.document, 'app_theme_pref.txt');
        if (themeFile.exists) {
          const savedTheme = await themeFile.text() as AppThemeName;
          if (THEMES[savedTheme]) {
            setActiveThemeName(savedTheme);
          }
        }
      } catch (err) {
        console.warn('Failed to load theme preference', err);
      }
    };
    loadTheme();
  }, []);

  const setTheme = async (name: AppThemeName) => {
    if (THEMES[name]) {
      setActiveThemeName(name);
      try {
        const themeFile = new File(Paths.document, 'app_theme_pref.txt');
        themeFile.write(name);
      } catch (err) {
        console.warn('Failed to save theme preference', err);
      }
    }
  };

  return (
    <AppThemeContext.Provider 
      value={{ 
        activeThemeName, 
        setTheme, 
        activeTheme: THEMES[activeThemeName] 
      }}
    >
      {children}
    </AppThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(AppThemeContext);
