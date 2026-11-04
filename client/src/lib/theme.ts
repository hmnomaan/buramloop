export type AppTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'buram_theme';

export function getSavedTheme(): AppTheme {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = theme === 'dark' ? '#0B1220' : '#F8FAF6';
  }
}
