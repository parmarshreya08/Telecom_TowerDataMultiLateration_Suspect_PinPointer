# E-Rakshak — Frontend

Enterprise-grade React frontend for the E-Rakshak Telecom CDR Investigation Platform.  
Built for Police Departments, Cyber Crime Cells, and Intelligence Agencies.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite 5 | Build tool |
| TailwindCSS 3 | Styling |
| React Router 6 | Client-side routing |
| React Query 5 | Server state management |
| React Hook Form + Zod | Form validation |
| React Leaflet | Interactive maps |
| Framer Motion | Animations |
| Lucide Icons | Icon library |
| Socket.io Client | Real-time tracking (stub) |
| Axios | HTTP client |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env

# 3. Start development server
npm run dev
```

Open http://localhost:5173

> Make sure the backend FastAPI server is running on http://localhost:8000

---

## Folder Structure

```
src/
├── components/
│   ├── ui/               # Reusable primitives (Button, Input, Card, Modal…)
│   ├── layout/           # Sidebar, Topbar
│   ├── map/              # React Leaflet investigation map
│   ├── investigation/    # Algorithm cards, timeline, share modal
│   └── notifications/    # Notification drawer
├── pages/
│   ├── LandingPage       # Public homepage
│   ├── LoginPage         # Officer sign-in
│   ├── RegisterPage      # Officer registration
│   ├── DashboardPage     # Stats overview + recent cases
│   ├── InvestigationsPage# Case list with filters
│   ├── NewInvestigationPage # Create investigation form
│   ├── InvestigationDetailPage # Case detail + timeline
│   ├── UploadCDRPage     # Drag-drop CDR upload + detection results
│   ├── ProcessingPage    # Animated pipeline progress
│   ├── LiveInvestigationPage # Map + real-time tracking panel
│   ├── ReportsPage       # Export investigation reports
│   ├── ProfilePage       # Officer profile + password change
│   └── SettingsPage      # Theme, notifications, map prefs
├── layouts/              # AppLayout (sidebar + topbar shell)
├── routes/               # Protected/public route wrappers
├── contexts/             # AuthContext, ThemeContext
├── hooks/                # useAuth, useTheme, useSocket, useRealtimeTracking, useNotifications
├── services/
│   ├── api.ts            # Axios client + all API calls
│   └── socket.ts         # Socket.io client service
├── engine/
│   └── engine.ts         # Investigation engine abstraction (TODO: wire backend)
├── mock/                 # Development mock data
├── types/                # TypeScript interfaces mirroring backend contracts
├── constants/            # App-wide constants
├── utils/                # Date, coordinate, file helpers
└── styles/
    └── globals.css       # Tailwind base + component layer
```

---

## Backend Integration

All backend calls are in `src/services/api.ts`.  
Search for `// TODO:` comments throughout the codebase for integration points.

### Currently wired (live backend endpoints)
| Endpoint | Used in |
|---|---|
| `POST /api/upload` | `UploadCDRPage` via `uploadApi.uploadFile()` |
| `GET /health` | Available via `healthApi.check()` |

### Pending (not yet in backend)
| Feature | File | TODO Comment |
|---|---|---|
| Auth login/register/OAuth | `services/api.ts` → `authApi` | Backend auth endpoints |
| Investigation CRUD | `services/api.ts` → `investigationApi` | Investigation management endpoints |
| Real-time tracking | `engine/engine.ts` | WebSocket + trilateration engine |
| Reports/export | `services/api.ts` → `reportApi` | Export generation endpoints |
| Notifications | `services/api.ts` → `notificationApi` | Notification endpoints |

---

## Authentication Flow

The frontend uses mock auth by default (see `src/mock/auth.ts`).  
Demo credentials: any email + any password with 6+ characters.

Once backend auth is implemented:
1. Replace `useAuth.ts` mock with real `authApi.login()` call
2. Store JWT token in `localStorage` under key `erakshak_auth_token`
3. The Axios interceptor in `api.ts` will automatically attach `Authorization: Bearer <token>`

---

## Real-time Tracking

WebSocket integration is fully stubbed. The engine abstraction in `src/engine/engine.ts` exports:

```typescript
initializeEngine(investigationId)
runEngine(investigationId, settings)
stopEngine(investigationId)
resumeEngine(investigationId)
subscribeEngine(event, callback)
unsubscribeEngine(event, callback)
```

All real-time components communicate **only** through this abstraction.  
Implement the actual engine in `engine.ts` once backend WebSocket endpoints are ready.

---

## Dark / Light Mode

Toggle via the sun/moon button in the topbar.  
Preference is persisted in `localStorage`.

---

## Build

```bash
npm run build
```

Output goes to `dist/` — ready for any static host or Docker container.
