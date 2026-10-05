import { useState } from 'react'
import { Sun, Moon, Monitor, Bell, Map, FileText, Globe, Save } from 'lucide-react'
import { useThemeContext } from '@/hooks/useThemeContext'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { cn } from '@/utils'

export default function SettingsPage() {
  const { theme, setTheme } = useThemeContext()
  const [notifications, setNotifications] = useState({
    location_updates: true,
    tower_changes:    true,
    signal_alerts:    true,
    email_status:     false,
    reports:          true,
  })
  const [mapProvider, setMapProvider]     = useState('openstreetmap')
  const [exportFormat, setExportFormat]   = useState('pdf')
  const [language, setLanguage]           = useState('en')
  const [saved, setSaved]                 = useState(false)

  const handleSave = async () => {
    // ponytail: settings persistence not implemented, show feedback only
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">Settings</h1>
        <p className="text-base text-surface-500 dark:text-surface-400">Customize your platform experience</p>
      </div>

      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-4 text-base text-green-700 dark:bg-green-900/20 dark:text-green-300">
          Settings saved (local only — backend persistence coming soon)
        </div>
      )}

      {/* Theme */}
      <Card>
        <CardHeader><CardTitle><Sun className="mr-2 inline h-4 w-4" />Appearance</CardTitle></CardHeader>
        <div className="grid grid-cols-3 gap-4">
          {([
            { value: 'light', label: 'Light', icon: Sun },
            { value: 'dark',  label: 'Dark',  icon: Moon },
            { value: 'system',label: 'System',icon: Monitor },
          ] as const).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => value !== 'system' && setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-5 transition-colors',
                (value === 'system' ? false : theme === value)
                  ? 'border-primary-500 bg-primary-50 dark:border-primary-500 dark:bg-primary-950/20'
                  : 'border-surface-200/60 hover:border-surface-300 dark:border-surface-700'
              )}
            >
              <Icon className="h-5 w-5 text-surface-600 dark:text-surface-300" />
              <span className="text-base font-medium text-surface-700 dark:text-surface-300">{label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader><CardTitle><Globe className="mr-2 inline h-4 w-4" />Language</CardTitle></CardHeader>
        <Select
          options={[
            { value: 'en', label: 'English' },
            { value: 'hi', label: 'Hindi' },
            { value: 'gu', label: 'Gujarati' },
          ]}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          label="Display Language"
        />
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader><CardTitle><Bell className="mr-2 inline h-4 w-4" />Notification Preferences</CardTitle></CardHeader>
        <div className="space-y-3">
          {[
            { key: 'location_updates', label: 'Location Updates',         desc: 'Notify when suspect location changes' },
            { key: 'tower_changes',    label: 'Tower Changes',            desc: 'Notify when suspect switches cell towers' },
            { key: 'signal_alerts',    label: 'Signal Loss Alerts',       desc: 'Notify when tracking signal is lost' },
            { key: 'email_status',     label: 'Email Status',             desc: 'Notify on email delivery updates' },
            { key: 'reports',          label: 'Report Generation',        desc: 'Notify when reports are ready' },
          ].map(({ key, label, desc }) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-5 rounded-lg border border-surface-100 p-4 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800 transition-colors">
              <div>
                <p className="text-base font-medium text-surface-800 dark:text-surface-200">{label}</p>
                <p className="text-base text-surface-400">{desc}</p>
              </div>
              <div
                className={cn(
                  'relative h-5 w-9 cursor-pointer rounded-full transition-colors',
                  notifications[key as keyof typeof notifications] ? 'bg-primary-600' : 'bg-surface-200 dark:bg-surface-700'
                )}
                onClick={() => setNotifications((p) => ({ ...p, [key]: !p[key as keyof typeof notifications] }))}
              >
                <div className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  notifications[key as keyof typeof notifications] ? 'left-4' : 'left-0.5'
                )} />
              </div>
            </label>
          ))}
        </div>
      </Card>

      {/* Map */}
      <Card>
        <CardHeader><CardTitle><Map className="mr-2 inline h-4 w-4" />Map Settings</CardTitle></CardHeader>
        <Select
          label="Map Provider"
          options={[
            { value: 'openstreetmap', label: 'OpenStreetMap (default)' },
            { value: 'satellite',     label: 'Satellite View (ESRI)' },
          ]}
          value={mapProvider}
          onChange={(e) => setMapProvider(e.target.value)}
        />
      </Card>

      {/* Exports */}
      <Card>
        <CardHeader><CardTitle><FileText className="mr-2 inline h-4 w-4" />Export Preferences</CardTitle></CardHeader>
        <Select
          label="Default Export Format"
          options={[
            { value: 'pdf',     label: 'PDF Report' },
            { value: 'excel',   label: 'Excel Spreadsheet' },
            { value: 'csv',     label: 'CSV Data' },
          ]}
          value={exportFormat}
          onChange={(e) => setExportFormat(e.target.value)}
        />
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" size="md" icon={<Save className="h-4 w-4" />} onClick={handleSave}>
          Save Settings
        </Button>
      </div>
    </div>
  )
}
