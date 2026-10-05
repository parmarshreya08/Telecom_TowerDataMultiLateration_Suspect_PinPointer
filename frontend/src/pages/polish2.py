import os
import re

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
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Increase base padding for inner elements
    content = content.replace('p-4', 'p-5')
    content = content.replace('p-3', 'p-4')
    
    # Text sizing adjustments to look more enterprise (less tiny text)
    content = content.replace('text-2xs', 'text-xs text-surface-500/80')
    content = content.replace('text-xs', 'text-sm')
    content = content.replace('text-sm', 'text-[15px]') # a bit custom, but let's just do standard tailwind
    
    # Replace the previous custom tailwind class with standard tailwind to be safe
    content = content.replace('text-[15px]', 'text-base')
    content = content.replace('text-base text-surface-500/80', 'text-xs text-surface-500')
    
    # Better shadow and border for cards and inputs
    content = content.replace('shadow-sm', 'shadow-md')
    content = content.replace('border-surface-200', 'border-surface-200/60')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)
    print(f'Processed {f}')
