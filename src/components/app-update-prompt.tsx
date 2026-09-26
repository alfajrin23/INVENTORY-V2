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
import { fallbackReleaseSummary, summarizeReleaseBody } from '@/lib/release-notes'

const RELEASES_URL = 'https://api.github.com/repos/alfajrin23/INVENTORY-V2/releases?per_page=10'
const UPDATE_CHECK_KEY = 'ab:last-update-check-at'
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

type GitHubAsset = {
  name: string
  browser_download_url: string
}

type GitHubRelease = {
  draft: boolean
  prerelease: boolean
  tag_name: string
  name: string | null
  body: string | null
  published_at: string | null
  assets: GitHubAsset[]
}

type AvailableUpdate = {
  version: string
  title: string
  notes: string[]
  apkUrl: string
}

type ParsedVersion = {
  core: number[]
  prerelease: Array<number | string> | null
}

function parseVersion(value: string): ParsedVersion | null {
  const clean = value.trim().replace(/^v/i, '').split('+')[0]
  const [coreText, prereleaseText] = clean.split('-', 2)
  const coreParts = coreText.split('.').map(part => Number(part))
  if (!coreParts.length || coreParts.some(part => !Number.isInteger(part) || part < 0)) return null
  while (coreParts.length < 3) coreParts.push(0)

  return {
    core: coreParts,
    prerelease: prereleaseText
      ? prereleaseText.split('.').map(part => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()))
      : null,
  }
}

function compareVersions(left: string, right: string) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return 0

  const coreLength = Math.max(a.core.length, b.core.length)
  for (let index = 0; index < coreLength; index += 1) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (difference) return Math.sign(difference)
  }

  if (a.prerelease === null && b.prerelease !== null) return 1
  if (a.prerelease !== null && b.prerelease === null) return -1
  if (a.prerelease === null || b.prerelease === null) return 0

  const prereleaseLength = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < prereleaseLength; index += 1) {
    const av = a.prerelease[index]
    const bv = b.prerelease[index]
    if (av === undefined) return -1
    if (bv === undefined) return 1
    if (av === bv) continue
    if (typeof av === 'number' && typeof bv === 'number') return av > bv ? 1 : -1
    if (typeof av === 'number') return -1
    if (typeof bv === 'number') return 1
    return av > bv ? 1 : -1
  }

  return 0
}

async function findAvailableUpdate(currentVersion: string): Promise<AvailableUpdate | null> {
  const response = await fetch(RELEASES_URL, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`GitHub release check gagal (${response.status})`)

  const releases = (await response.json()) as GitHubRelease[]
  const candidates = releases
    .filter(release => !release.draft)
    .map(release => {
      const apk = release.assets.find(asset => asset.name.toLowerCase().endsWith('.apk'))
      if (!apk) return null
      const version = release.tag_name.replace(/^v/i, '')
      if (compareVersions(version, currentVersion) <= 0) return null
      const notes = summarizeReleaseBody(release.body)
      return {
        version,
        title: release.name?.trim() || `Versi ${version}`,
        notes: notes.length ? notes : fallbackReleaseSummary(),
        apkUrl: apk.browser_download_url,
      } satisfies AvailableUpdate
    })
    .filter((release): release is AvailableUpdate => Boolean(release))
    .sort((a, b) => compareVersions(b.version, a.version))

  return candidates[0] ?? null
}

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
    const check = async () => {
      const lastCheck = Number(localStorage.getItem(UPDATE_CHECK_KEY) ?? 0)
      if (Number.isFinite(lastCheck) && Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return

      try {
        const current = await ABAppUpdate.getAppInfo()
        const available = await findAvailableUpdate(current.versionName)
        localStorage.setItem(UPDATE_CHECK_KEY, String(Date.now()))
        if (!cancelled && available) {
          setUpdate(available)
          setOpen(true)
        }
      } catch {
        // Update checks are best-effort and must never block inventory startup.
      }
    }

    void check()
    return () => { cancelled = true }
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
