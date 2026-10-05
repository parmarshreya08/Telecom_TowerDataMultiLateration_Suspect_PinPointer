import os

files = [
    r'D:\placement\hackathon\e-rakshak\Telecom_TowerDataMultiLateration_Suspect_PinPointer\frontend\src\pages\DashboardPage.tsx',
    r'D:\placement\hackathon\e-rakshak\Telecom_TowerDataMultiLateration_Suspect_PinPointer\frontend\src\pages\AdminDashboardPage.tsx',
    r'D:\placement\hackathon\e-rakshak\Telecom_TowerDataMultiLateration_Suspect_PinPointer\frontend\src\pages\UserManagementPage.tsx',
    r'D:\placement\hackathon\e-rakshak\Telecom_TowerDataMultiLateration_Suspect_PinPointer\frontend\src\pages\SettingsPage.tsx',
    r'D:\placement\hackathon\e-rakshak\Telecom_TowerDataMultiLateration_Suspect_PinPointer\frontend\src\pages\AuditLogsPage.tsx',
    r'D:\placement\hackathon\e-rakshak\Telecom_TowerDataMultiLateration_Suspect_PinPointer\frontend\src\pages\ReportsPage.tsx',
    r'D:\placement\hackathon\e-rakshak\Telecom_TowerDataMultiLateration_Suspect_PinPointer\frontend\src\pages\InvestigationsPage.tsx'
]

for f in files:
    if not os.path.exists(f):
        print(f"File not found: {f}")
        continue
    
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Increase padding in cards
    content = content.replace('className="card p-4"', 'className="card p-6 shadow-sm border border-surface-200 dark:border-surface-800"')
    
    # Increase table row padding
    content = content.replace('py-3', 'py-4')
    content = content.replace('py-3.5', 'py-4')
    
    # Increase spacing in main containers
    content = content.replace('space-y-6', 'space-y-8')
    
    # Center max width containers
    content = content.replace('max-w-7xl', 'max-w-7xl mx-auto')
    content = content.replace('max-w-5xl', 'max-w-5xl mx-auto')
    
    # Write back
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)
    print(f'Processed {f}')
