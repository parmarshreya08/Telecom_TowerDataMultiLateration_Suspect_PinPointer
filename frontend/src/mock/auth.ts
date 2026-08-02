import type { Officer } from '@/types'

export const MOCK_OFFICER: Officer = {
  id:          'off-001',
  name:        'Inspector Rajesh Kumar',
  department:  'Surat City Police — Cyber Crime Cell',
  designation: 'Inspector',
  email:       'rajesh.kumar@suratpolice.gov.in',
  badge_number: 'SCT-2847',
  created_at:  '2024-01-15T09:00:00Z',
  last_login:  new Date().toISOString(),
  preferences: {
    theme:                    'dark',
    language:                 'en',
    notifications_enabled:    true,
    map_provider:             'openstreetmap',
    export_format:            'pdf',
  },
}
