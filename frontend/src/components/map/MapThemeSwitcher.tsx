import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Layers, Check, Satellite, Moon, Map as MapIcon, Mountain } from 'lucide-react'
import { useMapTheme } from '@/hooks/useMapTheme'
import { cn } from '@/utils'

interface MapThemeSwitcherProps {
  className?: string
  align?: 'left' | 'right'
}

const MENU_WIDTH = 288 // w-72
const MENU_GAP   = 8   // mt-2

export function MapThemeSwitcher({ className, align = 'right' }: MapThemeSwitcherProps) {
  const { themeId, activeTheme, setMapTheme, availableThemes } = useMapTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      // The menu is portalled to <body>, so it's not a DOM descendant of the
      // trigger wrapper — both must be checked to close on an outside click.
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Escape closes the menu.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  // Position against the viewport. The switcher sits in short map cards and at
  // the top of full-height workspace maps, so the menu has to pick whichever
  // side actually fits and then clamp itself inside the viewport.
  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return
    const rect = trigger.getBoundingClientRect()

    // Measure the real menu height instead of estimating it: theme descriptions
    // wrap, so a fixed guess goes wrong on narrow screens.
    const menuH = menu.offsetHeight
    const vh = window.innerHeight
    const vw = window.innerWidth

    const spaceBelow = vh - rect.bottom - MENU_GAP
    const spaceAbove = rect.top - MENU_GAP
    const placeAbove = spaceBelow < menuH && spaceAbove > spaceBelow

    // Grow into whichever side is roomier, but never exceed the natural menu height
    // (that would just add dead space); a short viewport scrolls the option list.
    const room = Math.max(
      180,
      Math.min(menuH, 320, placeAbove ? spaceAbove : spaceBelow)
    )
    const top = placeAbove
      ? Math.max(MENU_GAP, rect.top - MENU_GAP - room)
      : Math.min(rect.bottom + MENU_GAP, vh - room - MENU_GAP)

    // `align="right"` anchors the menu's right edge to the trigger's right edge,
    // matching the old `right-0` behaviour — then clamp both edges on-screen.
    const desiredLeft = align === 'right' ? rect.right - MENU_WIDTH : rect.left
    const left = Math.min(
      Math.max(MENU_GAP, desiredLeft),
      Math.max(MENU_GAP, vw - MENU_WIDTH - MENU_GAP)
    )

    setMenuStyle({
      position: 'fixed',
      width: MENU_WIDTH,
      maxHeight: room,
      top: Math.max(MENU_GAP, top),
      left,
    })
  }, [align])

  useLayoutEffect(() => {
    if (!isOpen) return
    positionMenu()
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    return () => {
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [isOpen, positionMenu])

  const getThemeIcon = (id: string) => {
    switch (id) {
      case 'satellite':
        return <Satellite className="h-4 w-4 text-emerald-400" />
      case 'dark':
        return <Moon className="h-4 w-4 text-blue-400" />
      case 'streets':
        return <MapIcon className="h-4 w-4 text-cyan-400" />
      case 'terrain':
        return <Mountain className="h-4 w-4 text-orange-400" />
      default:
        return <Layers className="h-4 w-4 text-slate-400" />
    }
  }

  return (
    <div
      ref={menuRef}
      className={cn('relative z-[1000]', className)}
      style={{ pointerEvents: 'auto' }}
      data-tour="map-basemap"
    >
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold select-none cursor-pointer shadow-lg backdrop-blur-md transition-all duration-200',
          'bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-700/80 hover:border-slate-500',
          isOpen && 'ring-2 ring-blue-500/50 border-blue-500'
        )}
        title="Change Basemap Cartography Layer"
        aria-label="Change Map Theme"
      >
        <div className="flex items-center justify-center p-1 rounded-md bg-slate-800 border border-slate-700">
          {getThemeIcon(activeTheme.id)}
        </div>
        <div className="flex flex-col text-left">
          <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">Basemap</span>
          <span className="font-medium text-slate-200 truncate max-w-[100px] sm:max-w-[120px]">
            {activeTheme.name.split(' ')[0]}
          </span>
        </div>
        <Layers className="h-3.5 w-3.5 text-slate-400 ml-0.5" />
      </button>

      {/* Dropdown Menu — portalled to <body> so short/overflowing map cards
          can't clip it. */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="z-[10030] flex flex-col overflow-hidden rounded-2xl p-2 bg-slate-950/95 border border-slate-800 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="shrink-0 px-3 py-2 border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 tracking-wide uppercase font-mono">
              Basemap Layers
            </span>
            <span className="text-[10px] text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/60 font-mono">
              Leaflet Tiles
            </span>
          </div>

          <div className="mt-1 flex-1 min-h-0 overflow-y-auto overscroll-contain p-0.5 [scrollbar-width:thin]">
            {availableThemes.map((theme) => {
              const isSelected = theme.id === themeId
              return (
                <button
                  key={theme.id}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 p-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer select-none',
                    isSelected
                      ? 'bg-blue-600/20 border border-blue-500/60 text-white'
                      : 'hover:bg-slate-900 border border-transparent text-slate-300 hover:text-white'
                  )}
                  type="button"
                  onClick={() => {
                    setMapTheme(theme.id)
                    setIsOpen(false)
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                        isSelected
                          ? 'bg-blue-600/40 border-blue-400/80'
                          : 'bg-slate-900 border-slate-800'
                      )}
                    >
                      {getThemeIcon(theme.id)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold truncate text-slate-100">
                          {theme.name}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[9px] px-1.5 py-0.2 rounded-full font-mono bg-slate-800 text-slate-400 border border-slate-700">
                          {theme.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        {theme.description}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="ml-2 shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-blue-500 text-white">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <div className="shrink-0 mt-1 pt-2 border-t border-slate-800/80 px-2 py-1 text-[10px] text-slate-500 font-mono flex items-center justify-between">
            <span>Synced to Officer Profile</span>
            <span className="text-emerald-400">● Live DB Persisted</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
