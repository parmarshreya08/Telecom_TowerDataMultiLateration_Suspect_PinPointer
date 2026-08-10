import React from 'react'

interface LogoProps {
  size?: number
  className?: string
}

export const Logo: React.FC<LogoProps> = ({ size = 32, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="E-Rakshak"
    role="img"
  >
    <defs>
      <linearGradient id="shield-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0F1B2D"/>
        <stop offset="100%" stopColor="#1E293B"/>
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    {/* Shield shape */}
    <path
      d="M100 10 L170 40 L170 110 C170 150 140 180 100 195 C60 180 30 150 30 110 L30 40 Z"
      fill="url(#shield-grad)"
      stroke="#0EA5E9"
      strokeWidth="2"
    />

    {/* Multilateration arcs */}
    <path d="M55 130 C55 95 75 65 100 50" stroke="#0EA5E9" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.8"/>
    <path d="M145 130 C145 95 125 65 100 50" stroke="#0EA5E9" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.8"/>
    <path d="M100 160 C75 145 55 115 55 90" stroke="#0EA5E9" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>
    <path d="M100 160 C125 145 145 115 145 90" stroke="#0EA5E9" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>

    {/* Tower marks on arcs */}
    <circle cx="55" cy="130" r="4" fill="#0EA5E9" opacity="0.7"/>
    <circle cx="145" cy="130" r="4" fill="#0EA5E9" opacity="0.7"/>
    <circle cx="100" cy="50" r="4" fill="#0EA5E9" opacity="0.7"/>

    {/* Central pinpoint */}
    <circle cx="100" cy="105" r="12" fill="#0F1B2D" stroke="#F59E0B" strokeWidth="2.5"/>
    <circle cx="100" cy="105" r="5" fill="#F59E0B" filter="url(#glow)"/>
    <circle cx="100" cy="105" r="2" fill="#FFFFFF"/>

    {/* Crosshair lines */}
    <line x1="100" y1="85" x2="100" y2="93" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="100" y1="117" x2="100" y2="125" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="80" y1="105" x2="88" y2="105" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="112" y1="105" x2="120" y2="105" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

export default Logo
