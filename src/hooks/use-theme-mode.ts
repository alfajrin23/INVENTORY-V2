import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

export type ThemeMode = 'dark' | 'light'

const THEME_KEY = 'theme'
const THEME_EVENT = 'abelektronik-theme-change'
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function initialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(max-width: 1023px)').matches ? 'light' : 'dark'
}

function applyTheme(next: ThemeMode) {
  document.documentElement.classList.toggle('dark', next === 'dark')
  document.documentElement.classList.toggle('light', next === 'light')
  localStorage.setItem(THEME_KEY, next)
}

export function useThemeMode() {
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme)

  const setTheme = useCallback((next: ThemeMode | ((current: ThemeMode) => ThemeMode)) => {
    setThemeState(current => typeof next === 'function' ? next(current) : next)
  }, [])

  const toggleTheme = useCallback(() => setTheme(current => current === 'dark' ? 'light' : 'dark'), [setTheme])

  useBrowserLayoutEffect(() => {
    applyTheme(theme)
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }))
  }, [theme])

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<ThemeMode>).detail
      if (next === 'light' || next === 'dark') setThemeState(next)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
        setThemeState(event.newValue)
      }
    }
    window.addEventListener(THEME_EVENT, onThemeChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(THEME_EVENT, onThemeChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return { theme, setTheme, toggleTheme }
}
