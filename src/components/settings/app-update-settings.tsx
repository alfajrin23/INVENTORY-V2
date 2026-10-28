import { Capacitor } from '@capacitor/core'
import { Check, Download, RefreshCw, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { GlassPanel } from '@/components/shared/glass-panel'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { ABAppUpdate } from '@/lib/android-app-update'
import {
  checkAvailableAppUpdate,
  UPDATE_CHECK_KEY,
  type AppUpdateCheck,
} from '@/lib/app-update-service'

export function AppUpdateSettings() {
  const isNative = Capacitor.isNativePlatform()
  const { showToast } = useToast()
  const [currentVersion, setCurrentVersion] = useState(__APP_VERSION__)
  const [result, setResult] = useState<AppUpdateCheck | null>(null)
  const [status, setStatus] = useState('Periksa GitHub untuk menyelaraskan versi APK.')
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!isNative) return
    let active = true
    void ABAppUpdate.getAppInfo().then(info => {
      if (active && info.versionName) setCurrentVersion(info.versionName)
    }).catch(() => {
      if (active) setStatus('Versi aplikasi belum dapat dibaca dari Android.')
    })
    return () => { active = false }
  }, [isNative])

  useEffect(() => {
    if (!isNative) return
    let disposed = false
    let remove: (() => Promise<void>) | undefined

    void ABAppUpdate.addListener('updateProgress', value => {
      if (!disposed) setProgress(Math.max(0, Math.min(100, value.percent)))
    }).then(handle => {
      remove = () => handle.remove()
      if (disposed) void handle.remove()
    }).catch(() => undefined)

    return () => {
      disposed = true
      if (remove) void remove()
    }
  }, [isNative])

  const checkForUpdates = useCallback(async () => {
    if (checking) return
    setChecking(true)
    setStatus('Memeriksa versi APK di GitHub Releases...')
    try {
      const check = await checkAvailableAppUpdate(currentVersion)
      localStorage.setItem(UPDATE_CHECK_KEY, String(Date.now()))
      setResult(check)
      if (!check.latestRelease) {
        setStatus('Belum ada APK release yang dapat diunduh dari GitHub.')
      } else if (check.update) {
        setStatus('Versi ' + check.update.version + ' tersedia untuk dipasang.')
      } else {
        setStatus('APK sudah terbaru, versi ' + check.latestRelease.version + '.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub tidak dapat diperiksa.'
      setStatus(message)
      showToast(message, 'error')
    } finally {
      setChecking(false)
    }
  }, [checking, currentVersion, showToast])

  const downloadUpdate = useCallback(async () => {
    const update = result?.update
    if (!update || installing) return
    if (!isNative) {
      window.open(update.apkUrl, '_blank', 'noopener,noreferrer')
      return
    }

    setInstalling(true)
    setProgress(0)
    try {
      const permission = await ABAppUpdate.canInstallPackages()
      if (!permission.granted) {
        await ABAppUpdate.requestInstallPermission()
        setStatus('Izinkan pemasangan dari aplikasi ini, kembali ke sini, lalu tekan tombol download lagi.')
        showToast('Aktifkan “Izinkan dari sumber ini”, lalu kembali ke Pengaturan aplikasi.', 'info')
        return
      }

      await ABAppUpdate.downloadAndInstall({ url: update.apkUrl })
      setProgress(100)
      setStatus('APK versi ' + update.version + ' siap dipasang lewat dialog Android.')
      showToast('APK update siap. Konfirmasi pemasangan pada dialog Android.', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download APK gagal.'
      setStatus(message)
      showToast(message, 'error')
    } finally {
      setInstalling(false)
    }
  }, [installing, isNative, result, showToast])

  return (
    <section id="app-update" aria-label="Update Aplikasi" className="scroll-mt-24">
      <GlassPanel className="space-y-4 p-4 sm:p-5" glow="cyan">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/12 text-cyan-100">
            <Smartphone className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold text-white">Update Aplikasi</h2>
            <p className="mt-1 text-sm leading-6 text-white/62">
              Selaraskan APK dengan versi terbaru yang sudah diterbitkan di GitHub Releases.
              Commit saja belum dapat dipasang sebelum APK bertanda tangan tersedia sebagai asset release.
            </p>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-3 sm:grid-cols-2">
          <p className="text-sm text-white/62">Versi terpasang <strong className="ml-1 text-white">{currentVersion}</strong></p>
          <p className="text-sm text-white/62">
            Versi GitHub <strong className="ml-1 text-white">{result?.latestRelease?.version ?? 'Belum diperiksa'}</strong>
          </p>
        </div>

        <p role="status" aria-live="polite" className="text-sm text-cyan-100/85">{status}</p>

        {result?.update ? (
          <div className="space-y-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-3" aria-label="Update tersedia">
            <div>
              <p className="font-semibold text-emerald-100">{result.update.title} · versi {result.update.version}</p>
              {result.update.publishedAt ? (
                <p className="mt-1 text-xs text-white/48">
                  Diterbitkan {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(result.update.publishedAt))}
                </p>
              ) : null}
            </div>
            <ul className="space-y-1.5 text-sm text-white/70">
              {result.update.notes.map((note, index) => <li key={String(index) + '-' + note}>• {note}</li>)}
            </ul>
          </div>
        ) : null}

        {installing ? (
          <div className="space-y-2" aria-label="Kemajuan download update">
            <div className="flex justify-between text-xs text-white/55"><span>Mengunduh asset APK</span><span>{Math.round(progress)}%</span></div>
            <Progress value={progress} />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={checking || installing} onClick={() => void checkForUpdates()}>
            <RefreshCw className={checking ? 'size-4 animate-spin' : 'size-4'} />
            {checking ? 'Menyelaraskan...' : 'Cek versi terbaru'}
          </Button>
          {result?.update ? (
            isNative ? (
              <Button type="button" disabled={installing || checking} onClick={() => void downloadUpdate()} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
                {installing ? <RefreshCw className="size-4 animate-spin" /> : <Download className="size-4" />}
                {installing ? 'Mengunduh asset' : 'Download asset & update'}
              </Button>
            ) : (
              <Button asChild className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
                <a href={result.update.apkUrl} target="_blank" rel="noreferrer"><Download className="size-4" />Download asset APK</a>
              </Button>
            )
          ) : null}
          {result?.latestRelease && !result.update ? <Check className="mt-2 size-5 text-emerald-200" aria-label="Versi APK terbaru" /> : null}
        </div>

        <p className="text-xs leading-5 text-white/45">
          Pembaruan dipasang di atas aplikasi yang sama sehingga data tetap tersimpan. Android akan meminta konfirmasi pemasangan; aplikasi tidak perlu dihapus.
        </p>
      </GlassPanel>
    </section>
  )
}
