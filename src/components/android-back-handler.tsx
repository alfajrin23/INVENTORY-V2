import { Capacitor } from '@capacitor/core'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useToast } from '@/hooks/use-toast'
import { ABAppUpdate } from '@/lib/android-app-update'
import { routes } from '@/lib/navigation'

const FALLBACK_PARENT: Record<string, string> = {
  [routes.incomingReport]: routes.reports,
  [routes.outgoingReport]: routes.reports,
  [routes.stockReport]: routes.reports,
  [routes.revenueYear]: routes.reports,
  [routes.revenueDay]: routes.reports,
  [routes.revenueWeek]: routes.reports,
  [routes.revenueMonth]: routes.reports,
  [routes.profile]: routes.settings,
  [routes.logsInput]: routes.settings,
  [routes.products]: routes.dashboard,
  [routes.history]: routes.dashboard,
  [routes.reports]: routes.dashboard,
  [routes.settings]: routes.dashboard,
}

type NativeBackWindow = Window & {
  __abHandleNativeBack?: () => void
}

function closeTopDialog() {
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"][data-state="open"]'),
  )
  const topDialog = dialogs.at(-1)
  const closeButton = topDialog?.querySelector<HTMLButtonElement>('[data-android-back-close]')
  if (!closeButton) return false
  closeButton.click()
  return true
}

function browserHistoryIndex() {
  const state = window.history.state as { idx?: unknown } | null
  return typeof state?.idx === 'number' ? state.idx : 0
}

export function AndroidBackHandler() {
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const locationRef = useRef(location)
  const lastExitBackAt = useRef(0)

  useEffect(() => {
    locationRef.current = location
  }, [location])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const onNativeBack = () => {
      if (closeTopDialog()) return

      const pathname = locationRef.current.pathname
      if (browserHistoryIndex() > 0) {
        navigate(-1)
        return
      }

      const parent = FALLBACK_PARENT[pathname]
      if (parent) {
        navigate(parent, { replace: true })
        return
      }

      if (pathname !== routes.dashboard && pathname !== '/index.html') {
        navigate(routes.dashboard, { replace: true })
        return
      }

      const now = Date.now()
      if (now - lastExitBackAt.current <= 2000) {
        void ABAppUpdate.exitApp()
        return
      }

      lastExitBackAt.current = now
      showToast('Tekan tombol kembali sekali lagi untuk keluar', 'success')
    }

    const nativeWindow = window as NativeBackWindow
    nativeWindow.__abHandleNativeBack = onNativeBack
    window.addEventListener('ab:native-back', onNativeBack)

    return () => {
      window.removeEventListener('ab:native-back', onNativeBack)
      if (nativeWindow.__abHandleNativeBack === onNativeBack) {
        delete nativeWindow.__abHandleNativeBack
      }
    }
  }, [navigate, showToast])

  return null
}
