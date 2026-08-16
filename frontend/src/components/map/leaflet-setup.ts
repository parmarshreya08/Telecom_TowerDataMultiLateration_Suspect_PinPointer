import L from 'leaflet'

if (typeof window !== 'undefined') {
  ;(window as unknown as { L: typeof L }).L = L
}
