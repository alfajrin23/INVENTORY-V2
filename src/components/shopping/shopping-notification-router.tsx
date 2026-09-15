import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { routes } from '@/lib/navigation'

export function ShoppingNotificationRouter() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let closed = false
    let remove: (() => Promise<void>) | undefined

    void LocalNotifications.addListener('localNotificationActionPerformed', action => {
      const extra = action.notification.extra as { destination?: string } | undefined
      if (action.actionId !== 'open-shopping' && extra?.destination !== 'shopping') return
      // AppShell also owns the general inventory notification listener. Queue this
      // destination last so a shopping notification always finishes on Belanja.
      window.setTimeout(() => {
        if (!closed) navigate(routes.shopping)
      }, 0)
    }).then(listener => {
      remove = () => listener.remove()
      if (closed) void listener.remove()
    })

    return () => {
      closed = true
      if (remove) void remove()
    }
  }, [navigate])

  return null
}
