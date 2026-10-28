import { fallbackReleaseSummary, summarizeReleaseBody } from '@/lib/release-notes'

const RELEASES_URL = 'https://api.github.com/repos/alfajrin23/INVENTORY-V2/releases?per_page=20'

export const UPDATE_CHECK_KEY = 'ab:last-update-check-at'
export const UPDATE_DISMISSED_KEY = 'ab:last-update-dismissed-version'
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

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
  html_url: string
  assets: GitHubAsset[]
}

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

export async function checkAvailableAppUpdate(currentVersion: string): Promise<AppUpdateCheck> {
  const response = await fetch(RELEASES_URL, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Pemeriksaan GitHub gagal (${response.status}).`)

  const releases = await response.json() as GitHubRelease[]
  const candidates = releases
    .filter(release => !release.draft && release.tag_name)
    .map((release): AvailableUpdate | null => {
      const apk = release.assets.find(asset => asset.name.toLowerCase() === 'abelektronik-inventory.apk')
      if (!apk) return null
      const version = release.tag_name.replace(/^v/i, '')
      if (!parseVersion(version)) return null
      const releaseNotes = summarizeReleaseBody(release.body)
      return {
        version,
        title: release.name?.trim() || `Versi ${version}`,
        notes: releaseNotes.length ? releaseNotes : fallbackReleaseSummary(),
        apkUrl: apk.browser_download_url,
        releaseUrl: release.html_url,
        publishedAt: release.published_at,
      }
    })
    .filter((release): release is AvailableUpdate => Boolean(release))
    .sort((left, right) => compareAppVersions(right.version, left.version))

  const latestRelease = candidates[0] ?? null
  const update = candidates.find(release => compareAppVersions(release.version, currentVersion) > 0) ?? null
  return { latestRelease, update }
}
