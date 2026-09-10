import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-700.css'
import './styles/theme.css'
import './styles/app.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
