import { useState, useEffect, useCallback } from 'react'
import { MAP_THEMES, DEFAULT_MAP_THEME, getMapTheme, type MapThemeConfig } from '@/constants/mapThemes'
import { getStoredOfficer, hasValidSession, authApi } from '@/services/auth'

const STORAGE_KEY = 'erakshak_map_theme'
const EVENT_KEY = 'erakshak:map-theme-change'

export function useMapTheme() {
  const [themeId, setThemeIdState] = useState<string>(() => {
    // 1. Check logged-in officer profile
    if (hasValidSession()) {
      const officer = getStoredOfficer()
      if (officer?.map_theme && MAP_THEMES[officer.map_theme]) {
        return officer.map_theme
      }
    }
    // 2. Check localStorage
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && MAP_THEMES[saved]) {
      return saved
    }
    return DEFAULT_MAP_THEME
  })

  // Listen to cross-component changes
  useEffect(() => {
    const handleStorageChange = (e: CustomEvent<string>) => {
      if (e.detail && MAP_THEMES[e.detail]) {
        setThemeIdState(e.detail)
      }
    }
    window.addEventListener(EVENT_KEY as any, handleStorageChange)
    return () => {
      window.removeEventListener(EVENT_KEY as any, handleStorageChange)
    }
  }, [])

  const setMapTheme = useCallback((newThemeId: string) => {
    if (!MAP_THEMES[newThemeId]) return
    setThemeIdState(newThemeId)
    localStorage.setItem(STORAGE_KEY, newThemeId)

    // Notify all mounted map instances
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: newThemeId }))

    // If logged in, sync with backend database
    if (hasValidSession()) {
      authApi.updatePreferences({ map_theme: newThemeId }).catch((err) => {
        console.warn('Failed to sync map theme preference with backend:', err)
      })
    }
  }, [])

  const activeTheme: MapThemeConfig = getMapTheme(themeId)

  return {
    themeId,
    activeTheme,
    setMapTheme,
    availableThemes: Object.values(MAP_THEMES),
  }
}
