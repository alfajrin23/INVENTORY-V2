import { Capacitor, registerPlugin } from '@capacitor/core'

type NativeSaveResult = {
  uri: string
  path: string
}

type ABFileSaverPlugin = {
  saveBase64File(options: {
    dataUrl: string
    fileName: string
    mimeType: string
  }): Promise<NativeSaveResult>
}

const ABFileSaver = registerPlugin<ABFileSaverPlugin>('ABFileSaver')
let installed = false

function mimeFromFilename(fileName: string) {
  const lower = fileName.toLocaleLowerCase('id-ID')
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.csv')) return 'text/csv'
  return 'application/octet-stream'
}

function dataUrlMime(dataUrl: string, fallback: string) {
  const match = /^data:([^;,]+)[;,]/i.exec(dataUrl)
  return match?.[1] || fallback
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('File gagal dibaca sebelum disimpan.'))
    reader.readAsDataURL(blob)
  })
}

async function saveNativeDownload(href: string, fileName: string) {
  let dataUrl = href
  let mimeType = mimeFromFilename(fileName)

  if (href.startsWith('blob:')) {
    const response = await fetch(href)
    if (!response.ok) throw new Error('File sementara gagal dibaca.')
    const blob = await response.blob()
    mimeType = blob.type || mimeType
    dataUrl = await blobToDataUrl(blob)
  } else if (href.startsWith('data:')) {
    mimeType = dataUrlMime(href, mimeType)
  } else {
    return false
  }

  const result = await ABFileSaver.saveBase64File({ dataUrl, fileName, mimeType })
  window.dispatchEvent(new CustomEvent('ab-native-download-saved', {
    detail: { ...result, fileName, mimeType },
  }))
  return true
}

function findDownloadAnchor(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLAnchorElement>('a[download]')
}

/**
 * Browser biasa tetap memakai download native browser. Pada Capacitor Android,
 * anchor download data:/blob: dicegat lalu disimpan melalui MediaStore ke
 * Download/ABElektronik agar benar-benar terlihat di penyimpanan HP.
 */
export function installAndroidDownloadInterceptor() {
  if (installed || typeof document === 'undefined') return
  installed = true

  if (Capacitor.isNativePlatform()) {
    document.documentElement.classList.add('is-capacitor-native')
  }

  document.addEventListener('click', (event) => {
    if (!Capacitor.isNativePlatform()) return

    const anchor = findDownloadAnchor(event.target)
    if (!anchor) return

    const href = anchor.href
    if (!href.startsWith('data:') && !href.startsWith('blob:')) return

    const fileName = anchor.download || 'abelektronik-download'
    event.preventDefault()
    event.stopImmediatePropagation()

    void saveNativeDownload(href, fileName).catch((error) => {
      window.dispatchEvent(new CustomEvent('ab-native-download-error', {
        detail: {
          fileName,
          message: error instanceof Error ? error.message : 'File gagal disimpan.',
        },
      }))
    })
  }, true)
}
