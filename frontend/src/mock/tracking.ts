import type { LocalizationResult, AlgorithmResult, PathPoint, TowerRecord } from '@/types'

export const MOCK_LOCALIZATION: LocalizationResult = {
  latitude:           21.1702,
  longitude:          72.8311,
  raw_latitude:       21.1698,
  raw_longitude:      72.8314,
  velocity_m_s:       1.4,
  clock_bias_meters:  12.3,
  residual_rms:       0.0042,
  gdop:               1.8,
  adaptive_R_scale:   0.92,
  adaptive_Q_scale:   0.87,
  geojson_heatmap:    null,
  timestamp:          new Date().toISOString(),
  accuracy_meters:    85,
  heading_degrees:    234,
  algorithm_used:     'Kalman',
  confidence:         0.87,
}

export const MOCK_ALGORITHM_RESULTS: AlgorithmResult[] = [
  {
    algorithm:       'Trilateration',
    status:          'success',
    execution_time_ms: 42,
    accuracy_meters: 120,
    residual_rms:    0.0065,
    gdop:            2.1,
  },
  {
    algorithm:       'Multilateration',
    status:          'success',
    execution_time_ms: 78,
    accuracy_meters: 95,
    residual_rms:    0.0051,
    gdop:            1.9,
  },
  {
    algorithm:       'Kalman',
    status:          'success',
    execution_time_ms: 15,
    accuracy_meters: 85,
    adaptive_R_scale: 0.92,
    adaptive_Q_scale: 0.87,
    confidence:      0.87,
    clock_bias:      12.3,
    velocity:        { x: 0.9, y: 1.1, magnitude: 1.4 },
    prediction:      { latitude: 21.1704, longitude: 72.8309 },
  },
]

export const MOCK_PATH_POINTS: PathPoint[] = [
  { latitude: 21.1695, longitude: 72.8298, timestamp: '2026-08-02T10:30:00Z', accuracy_meters: 110, algorithm: 'Trilateration' },
  { latitude: 21.1697, longitude: 72.8302, timestamp: '2026-08-02T10:35:00Z', accuracy_meters: 105, algorithm: 'Multilateration' },
  { latitude: 21.1699, longitude: 72.8306, timestamp: '2026-08-02T10:40:00Z', accuracy_meters:  98, algorithm: 'Kalman' },
  { latitude: 21.1700, longitude: 72.8308, timestamp: '2026-08-02T10:45:00Z', accuracy_meters:  92, algorithm: 'Kalman' },
  { latitude: 21.1702, longitude: 72.8311, timestamp: '2026-08-02T10:50:00Z', accuracy_meters:  85, algorithm: 'Kalman' },
]

export const MOCK_TOWERS: TowerRecord[] = [
  {
    tower_id: 'twr-001',
    operator: 'Airtel',
    radio:    'LTE',
    mcc: 404, mnc: 20, lac: 1234, cell_id: 5678,
    cgi: '404-20-1234-5678',
    latitude:  21.1690, longitude: 72.8295,
    azimuth: 120, beamwidth: 65, range_meters: 800,
    site_address: 'Adajan Road, Surat',
  },
  {
    tower_id: 'twr-002',
    operator: 'Airtel',
    radio:    'LTE',
    mcc: 404, mnc: 20, lac: 1234, cell_id: 5679,
    cgi: '404-20-1234-5679',
    latitude:  21.1710, longitude: 72.8320,
    azimuth: 240, beamwidth: 65, range_meters: 750,
    site_address: 'Piplod Cross Road, Surat',
  },
  {
    tower_id: 'twr-003',
    operator: 'Airtel',
    radio:    'LTE',
    mcc: 404, mnc: 20, lac: 1234, cell_id: 5680,
    cgi: '404-20-1234-5680',
    latitude:  21.1715, longitude: 72.8300,
    azimuth: 0, beamwidth: 65, range_meters: 900,
    site_address: 'Vesu Main Road, Surat',
  },
]
