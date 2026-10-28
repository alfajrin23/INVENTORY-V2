import { fallbackReleaseSummary, summarizeReleaseBody } from '@/lib/release-notes'

const UPDATE_FEED_URL = 'https://raw.githubusercontent.com/alfajrin23/INVENTORY-V2/feat/qris-dynamic-midtrans/public/app-update.json'
const UPDATE_FEED_CACHE_KEY = 'ab:app-update-feed-cache:v1'

export const UPDATE_CHECK_KEY = 'ab:last-update-check-at'
export const UPDATE_DISMISSED_KEY = 'ab:last-update-dismissed-version'
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

export type AvailableUpdate = {
  version: string
  title: string
  notes: string[]
  apkUrl: string
  releaseUrl: string
  publishedAt: string | null
}

export type AppUpdateCheck = {
  latestRelease: AvailableUpdate | null
  update: AvailableUpdate | null
}

type ParsedVersion = {
  core: number[]
  prerelease: Array<number | string> | null
}

type AppUpdateManifest = {
  version?: unknown
  title?: unknown
  body?: unknown
  notes?: unknown
  apkUrl?: unknown
  releaseUrl?: unknown
  publishedAt?: unknown
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

export function compareAppVersions(left: string, right: string) {
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

function isReleaseAssetUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && url.pathname.startsWith('/alfajrin23/INVENTORY-V2/releases/download/')
      && url.pathname.toLowerCase().endsWith('/abelektronik-inventory.apk')
  } catch {
    return false
  }
}

function parseUpdateManifest(value: unknown): AvailableUpdate | null {
  if (!value || typeof value !== 'object') return null
  const manifest = value as AppUpdateManifest
  const version = typeof manifest.version === 'string' ? manifest.version.trim().replace(/^v/i, '') : ''
  const apkUrl = typeof manifest.apkUrl === 'string' ? manifest.apkUrl.trim() : ''
  if (!parseVersion(version) || !isReleaseAssetUrl(apkUrl)) return null

  const notes = Array.isArray(manifest.notes)
    ? manifest.notes.filter((note): note is string => typeof note === 'string' && Boolean(note.trim())).slice(0, 8)
    : summarizeReleaseBody(typeof manifest.body === 'string' ? manifest.body : '')
  const releaseUrl = typeof manifest.releaseUrl === 'string'
    && manifest.releaseUrl.startsWith('https://github.com/alfajrin23/INVENTORY-V2/releases/tag/')
    ? manifest.releaseUrl
    : `https://github.com/alfajrin23/INVENTORY-V2/releases/tag/v${version}`

  return {
    version,
    title: typeof manifest.title === 'string' && manifest.title.trim() ? manifest.title.trim() : `Versi ${version}`,
    notes: notes.length ? notes : fallbackReleaseSummary(),
    apkUrl,
    releaseUrl,
    publishedAt: typeof manifest.publishedAt === 'string' ? manifest.publishedAt : null,
  }
}

function readCachedUpdate(): AvailableUpdate | null {
  try {
    const raw = localStorage.getItem(UPDATE_FEED_CACHE_KEY)
    return raw ? parseUpdateManifest(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeCachedUpdate(update: AvailableUpdate) {
  try {
    localStorage.setItem(UPDATE_FEED_CACHE_KEY, JSON.stringify(update))
  } catch {
    // The update check remains available when browser storage is full or disabled.
  }
}

export async function checkAvailableAppUpdate(currentVersion: string): Promise<AppUpdateCheck> {
  let latestRelease: AvailableUpdate | null = null

  try {
    const response = await fetch(`${UPDATE_FEED_URL}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Pemeriksaan feed update gagal (${response.status}).`)

    latestRelease = parseUpdateManifest(await response.json())
    if (!latestRelease) throw new Error('Manifest APK GitHub tidak valid.')
    writeCachedUpdate(latestRelease)
  } catch (error) {
    latestRelease = readCachedUpdate()
    if (!latestRelease) throw error
  }

  const update = compareAppVersions(latestRelease.version, currentVersion) > 0 ? latestRelease : null
  return { latestRelease, update }
}
