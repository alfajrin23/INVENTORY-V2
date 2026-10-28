import { Capacitor } from '@capacitor/core'
import { Download, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { ABAppUpdate } from '@/lib/android-app-update'
import {
  checkAvailableAppUpdate,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_KEY,
  UPDATE_DISMISSED_KEY,
  type AvailableUpdate,
} from '@/lib/app-update-service'

export function AppUpdatePrompt() {
  const { showToast } = useToast()
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)
  const [open, setOpen] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState(0)
  const waitingForInstallPermission = useRef(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let cancelled = false
    let checkInProgress = false
    const check = async () => {
      if (checkInProgress) return
      const lastCheck = Number(localStorage.getItem(UPDATE_CHECK_KEY) ?? 0)
      if (Number.isFinite(lastCheck) && Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return

      checkInProgress = true
      try {
        const current = await ABAppUpdate.getAppInfo()
        const { update: available } = await checkAvailableAppUpdate(current.versionName)
        localStorage.setItem(UPDATE_CHECK_KEY, String(Date.now()))
        if (!cancelled && available) {
          setUpdate(available)
          if (localStorage.getItem(UPDATE_DISMISSED_KEY) !== available.version) setOpen(true)
        }
      } catch {
        // Update checks are best-effort and must never block inventory startup.
      } finally {
        checkInProgress = false
      }
    }

    void check()
    const checkTimer = window.setInterval(() => { void check() }, UPDATE_CHECK_INTERVAL_MS)
    const checkOnResume = () => {
      if (!document.hidden) void check()
    }
    document.addEventListener('visibilitychange', checkOnResume)
    window.addEventListener('focus', checkOnResume)
    return () => {
      cancelled = true
      window.clearInterval(checkTimer)
      document.removeEventListener('visibilitychange', checkOnResume)
      window.removeEventListener('focus', checkOnResume)
    }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let disposed = false
    let remove: (() => Promise<void>) | undefined

    void ABAppUpdate.addListener('updateProgress', value => {
      if (!disposed) setProgress(Math.max(0, Math.min(100, value.percent)))
    }).then(handle => {
      remove = () => handle.remove()
      if (disposed) void handle.remove()
    })

    return () => {
      disposed = true
      if (remove) void remove()
    }
  }, [])

  const downloadUpdate = useCallback(async () => {
    if (!update || installing) return
    setInstalling(true)
    setProgress(0)
    try {
      await ABAppUpdate.downloadAndInstall({ url: update.apkUrl })
      setProgress(100)
      setInstalling(false)
      showToast('APK update siap. Lanjutkan instalasi pada dialog Android.', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update gagal diunduh'
      showToast(message, 'error')
      setInstalling(false)
    }
  }, [installing, showToast, update])

  const startUpdate = useCallback(async () => {
    if (!update || installing) return
    try {
      const permission = await ABAppUpdate.canInstallPackages()
      if (!permission.granted) {
        waitingForInstallPermission.current = true
        await ABAppUpdate.requestInstallPermission()
        showToast('Aktifkan “Izinkan dari sumber ini”, lalu kembali ke aplikasi.', 'success')
        return
      }
      await downloadUpdate()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update tidak dapat dimulai'
      showToast(message, 'error')
    }
  }, [downloadUpdate, installing, showToast, update])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const resumePendingInstall = () => {
      if (document.hidden || !waitingForInstallPermission.current || installing) return
      void ABAppUpdate.canInstallPackages().then(permission => {
        if (!permission.granted) return
        waitingForInstallPermission.current = false
        void downloadUpdate()
      })
    }

    document.addEventListener('visibilitychange', resumePendingInstall)
    window.addEventListener('focus', resumePendingInstall)
    return () => {
      document.removeEventListener('visibilitychange', resumePendingInstall)
      window.removeEventListener('focus', resumePendingInstall)
    }
  }, [downloadUpdate, installing])

  if (!update) return null
  const handleDialogChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) localStorage.setItem(UPDATE_DISMISSED_KEY, update.version)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-white/12 bg-[#121827]/98 text-white shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Download className="size-5 text-emerald-300" />
            Update aplikasi tersedia
          </DialogTitle>
          <DialogDescription className="text-white/60">
            {update.title} · versi {update.version}. Update dapat dipasang langsung tanpa menghapus aplikasi.
          </DialogDescription>
        </DialogHeader>

        <section className="max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.055] p-3" aria-label="Catatan pembaruan">
          <p className="text-sm font-bold text-white">Yang Baru</p>
          <ul className="mt-2 space-y-2">
            {update.notes.map((note, index) => (
              <li key={`${index}-${note}`} className="flex gap-2 text-sm leading-6 text-white/72">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-300" aria-hidden="true" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </section>

        {installing ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-white/55">
              <span>Mengunduh update</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={installing} onClick={() => setOpen(false)}>
            Nanti
          </Button>
          <Button type="button" disabled={installing} onClick={() => void startUpdate()} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
            {installing ? <RefreshCw className="size-4 animate-spin" /> : <Download className="size-4" />}
            {installing ? 'Mengunduh' : 'Update sekarang'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
