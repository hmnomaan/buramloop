import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { AppTheme, applyTheme, getSavedTheme } from '../../lib/theme';

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<AppTheme>(getSavedTheme);
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  const toggleTheme = () => {
    applyTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded border border-buram-border bg-buram-elevated px-2.5 text-buram-text transition-colors hover:border-buram-amber sm:px-3"
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === 'dark'}
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4 text-buram-gold" /> : <Moon className="h-4 w-4 text-buram-tech" />}
      <span className="hidden text-xs font-medium sm:inline">
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </span>
    </button>
  );
};
