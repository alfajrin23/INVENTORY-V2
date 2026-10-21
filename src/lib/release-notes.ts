import { Capacitor } from '@capacitor/core'

import { ABAppUpdate } from '@/lib/android-app-update'

const RELEASES_URL = 'https://api.github.com/repos/alfajrin23/INVENTORY-V2/releases?per_page=10'
const CACHE_KEY = 'ab:release-notes-cache:v1'
export const LAST_SEEN_RELEASE_NOTES_KEY = 'ab:last-seen-release-notes-version:v1'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const CURRENT_RELEASE_SUMMARY = [
  'Pembayaran QRIS memakai nominal sesuai total keranjang; kasir mengonfirmasi setelah mengecek dana di GoBiz.',
  'Riwayat QRIS ada di menu Laporan, setelah Belanja, dengan pencarian nominal/tanggal, rentang tanggal, dan pengurutan.',
  'Pengaturan gambar QRIS dipindah ke bagian paling bawah halaman Pengaturan.',
  'Tombol Voice kembali ke posisi semula di navigasi bawah HP.',
  'Peningkatan tampilan dan kestabilan transaksi QRIS.',
]

export type ReleaseNote = {
  version: string
  title: string
  publishedAt: string
  summary: string[]
  body: string
  source: 'github' | 'fallback'
}

type GitHubRelease = {
  draft?: boolean
  prerelease?: boolean
  tag_name?: string
  name?: string | null
  body?: string | null
  published_at?: string | null
}

type CacheValue = {
  fetchedAt: number
  releases: ReleaseNote[]
}

function normalizeVersion(value: string) {
  return value.trim().replace(/^v/i, '')
}

export function summarizeReleaseBody(body: string | null | undefined) {
  const lines = (body ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^#{1,6}\s/.test(line))
    .map(line => line.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean)
  return lines.slice(0, 8)
}

export function fallbackReleaseSummary() {
  return [...CURRENT_RELEASE_SUMMARY]
}

function fallbackNote(version: string): ReleaseNote {
  return {
    version,
    title: `Yang Baru di Inventory V2 ${version}`,
    publishedAt: new Date().toISOString(),
    source: 'fallback',
    summary: fallbackReleaseSummary(),
    body: CURRENT_RELEASE_SUMMARY.join('\n'),
  }
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left).split('.').map(part => Number.parseInt(part, 10) || 0)
  const rightParts = normalizeVersion(right).split('.').map(part => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference) return Math.sign(difference)
  }
  return 0
}

function includeCurrentFallback(releases: ReleaseNote[], currentVersion: string) {
  if (releases.some(release => normalizeVersion(release.version) === currentVersion)) return releases
  if (releases.length && compareVersions(currentVersion, releases[0].version) < 0) return releases
  return [fallbackNote(currentVersion), ...releases].slice(0, 10)
}

function readCache(): CacheValue | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheValue
    if (!Array.isArray(parsed.releases) || !Number.isFinite(parsed.fetchedAt)) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(releases: ReleaseNote[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), releases } satisfies CacheValue))
  } catch {
    // Cache is optional. Release notes still work from the local fallback.
  }
}

export async function getCurrentAppVersion() {
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await ABAppUpdate.getAppInfo()
      if (info.versionName) return normalizeVersion(info.versionName)
    } catch {
      // Web fallback below also keeps Playwright/mocked environments deterministic.
    }
  }
  return normalizeVersion(__APP_VERSION__)
}

export async function loadReleaseNotes(force = false): Promise<ReleaseNote[]> {
  const cached = readCache()
  const currentVersion = await getCurrentAppVersion()
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS && cached.releases.length) {
    const releases = includeCurrentFallback(cached.releases, currentVersion)
    if (releases !== cached.releases) writeCache(releases)
    return releases
  }

  try {
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`GitHub Releases ${response.status}`)
    const data = await response.json() as GitHubRelease[]
    const releases = data
      .filter(release => !release.draft && !release.prerelease && release.tag_name)
      .map((release): ReleaseNote => {
        const body = release.body?.trim() ?? ''
        return {
          version: normalizeVersion(release.tag_name ?? ''),
          title: release.name?.trim() || `Inventory V2 ${normalizeVersion(release.tag_name ?? '')}`,
          publishedAt: release.published_at ?? '',
          summary: summarizeReleaseBody(body),
          body,
          source: 'github',
        }
      })
      .filter(release => release.version)
    if (releases.length) {
      const releasesWithCurrent = includeCurrentFallback(releases, currentVersion)
      writeCache(releasesWithCurrent)
      return releasesWithCurrent
    }
  } catch {
    if (cached?.releases.length) return includeCurrentFallback(cached.releases, currentVersion)
  }

  const fallback = [fallbackNote(currentVersion)]
  writeCache(fallback)
  return fallback
}

export async function releaseNoteForCurrentVersion() {
  const version = await getCurrentAppVersion()
  const releases = await loadReleaseNotes()
  return {
    version,
    note: releases.find(release => normalizeVersion(release.version) === version) ?? fallbackNote(version),
  }
}

export function hasSeenReleaseNotes(version: string) {
  return localStorage.getItem(LAST_SEEN_RELEASE_NOTES_KEY) === normalizeVersion(version)
}

export function markReleaseNotesSeen(version: string) {
  localStorage.setItem(LAST_SEEN_RELEASE_NOTES_KEY, normalizeVersion(version))
}

export { RELEASES_URL }
