import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

import { validateStaticQris } from '@/lib/qris-payload'

export async function decodeStaticQrisImage(file: File) {
  const element = document.createElement('div')
  element.id = `qris-image-decode-${crypto.randomUUID()}`
  element.hidden = true
  document.body.appendChild(element)

  const scanner = new Html5Qrcode(element.id, {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false,
  })

  try {
    const result = await scanner.scanFileV2(file, false)
    const payload = result.decodedText
    const { merchantName } = validateStaticQris(payload)
    return { payload, merchantName }
  } catch (error) {
    const reason = error instanceof Error ? error.message : ''
    throw new Error(reason.includes('QRIS')
      ? reason
      : 'QRIS tidak terbaca. Unggah gambar QRIS statis yang tajam dan tidak terpotong.')
  } finally {
    scanner.clear()
    element.remove()
  }
}
