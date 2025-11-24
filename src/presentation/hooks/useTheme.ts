import { useEffect } from 'react';
import { useThemeStore, Theme } from '@application/stores/theme-store';

export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
} {
  const { theme, setTheme, toggleTheme } = useThemeStore();

  // Apply theme to document whenever it changes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}

