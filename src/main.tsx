import { createRoot } from 'react-dom/client'
import './index.css'
import { applyThemeFromStorage } from './utils/applyTheme'
import App from './App.tsx'

applyThemeFromStorage()

createRoot(document.getElementById('root')!).render(
  <App />
)
