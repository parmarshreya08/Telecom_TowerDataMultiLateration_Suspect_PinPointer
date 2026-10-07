import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/components/ui/Toast'
import { AppRoutes } from '@/routes/AppRoutes'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
