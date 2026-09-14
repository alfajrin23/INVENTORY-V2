import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './android-fixes.css'
import App from './App.tsx'
import { installAndroidDownloadInterceptor } from './lib/android-download-bridge'

installAndroidDownloadInterceptor()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
