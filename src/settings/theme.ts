export type Theme = 'system' | 'light' | 'dark'

export const THEMES: readonly Theme[] = ['system', 'light', 'dark']
export const DEFAULT_THEME: Theme = 'system'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

/**
 * Puts `theme` on the page: data-theme (which src/index.css keys the dark
 * tokens on), color-scheme (native form controls/scrollbars), and which
 * theme-color meta applies (the browser/status bar colour). The inline
 * script in index.html's <head> — and its copy in public/login.html — does
 * exactly the same before first paint, so there's no flash of the wrong
 * theme; keep the three in step.
 */
export function applyTheme(theme: Theme): void {
  const resolved = theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : theme
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  // Each theme-color meta carries its own colour; "Same as device" leaves
  // the browser choosing by media query, an explicit choice forces one.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][data-theme-color]').forEach((meta) => {
    const own = meta.dataset.themeColor
    meta.media = theme === 'system' ? `(prefers-color-scheme: ${own})` : own === theme ? 'all' : 'not all'
  })
}

/** Calls `listener` when the device switches between light and dark. */
export function onDeviceThemeChange(listener: () => void): void {
  darkQuery.addEventListener('change', listener)
}
