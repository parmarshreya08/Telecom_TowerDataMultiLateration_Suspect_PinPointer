import { useCallback, useMemo, useState } from 'react'
import { LS_KEYS } from '@/constants'
import { authApi, getStoredOfficer, hasValidSession } from '@/services/auth'

const PREF_KEY = 'workspace_tour_seen'

/**
 * Tracks whether the officer has already seen the one-time workspace tour.
 *
 * The flag is persisted in two places:
 *  - the officer's server-side `preferences` (per account, across devices), and
 *  - localStorage (instant, works before the profile round-trips).
 *
 * A user is considered "seen" if EITHER says so, so the tour never nags.
 */
export function useWorkspaceTour() {
  const officerPrefs = useMemo(() => {
    if (!hasValidSession()) return {}
    const officer = getStoredOfficer()
    return (officer?.preferences as Record<string, unknown> | undefined) ?? {}
  }, [])

  const hasSeen = useCallback((): boolean => {
    try {
      if (localStorage.getItem(LS_KEYS.WORKSPACE_TOUR_SEEN) === 'true') return true
    } catch {
      /* localStorage unavailable — fall through to server preference */
    }
    return officerPrefs[PREF_KEY] === true
  }, [officerPrefs])

  const [open, setOpen] = useState<boolean>(() => !hasSeen())

  /** Mark the tour as seen and persist to backend + localStorage. */
  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(LS_KEYS.WORKSPACE_TOUR_SEEN, 'true')
    } catch {
      /* ignore */
    }
    setOpen(false)
    if (hasValidSession()) {
      authApi
        .updatePreferences({ preferences: { [PREF_KEY]: true } })
        .catch((err) => console.warn('Failed to persist tour-seen preference:', err))
    }
  }, [])

  /** Persist immediately (used when the user finishes or skips). */
  const finish = useCallback(() => markSeen(), [markSeen])

  /** Let the user relaunch the tour from Settings/help. */
  const restart = useCallback(() => setOpen(true), [])

  return { open, hasSeen, finish, restart }
}
