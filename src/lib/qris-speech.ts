import { Capacitor, registerPlugin } from '@capacitor/core'

export const QRIS_VOICE_PROFILE_KEY = 'ab:qris-voice-profile'

export const PAYMENT_VOICE_PROFILES = [
  { id: 'female_formal', label: 'Perempuan formal', description: 'Nada lebih tinggi, tenang, dan jelas.' },
  { id: 'female_playful', label: 'Wanita lucu', description: 'Nada lebih tinggi dan ekspresif.' },
  { id: 'male_normal', label: 'Pria normal', description: 'Nada pria dengan tempo percakapan.' },
  { id: 'male_deep', label: 'Pria bas', description: 'Nada lebih rendah dan pelan.' },
] as const

export type QrisVoiceProfile = typeof PAYMENT_VOICE_PROFILES[number]['id']

type VoiceShape = {
  pitch: number
  rate: number
}

type PaymentSpeechPlugin = {
  speak(options: { text: string; profile: QrisVoiceProfile }): Promise<void>
}

const PaymentSpeech = registerPlugin<PaymentSpeechPlugin>('ABPaymentSpeech')

const VOICE_SHAPES: Record<QrisVoiceProfile, VoiceShape> = {
  female_formal: { pitch: 1.12, rate: 0.92 },
  female_playful: { pitch: 1.3, rate: 1.02 },
  male_normal: { pitch: 0.92, rate: 0.98 },
  male_deep: { pitch: 0.76, rate: 0.91 },
}

export function getQrisVoiceProfile(): QrisVoiceProfile {
  try {
    const stored = localStorage.getItem(QRIS_VOICE_PROFILE_KEY)
    if (PAYMENT_VOICE_PROFILES.some(profile => profile.id === stored)) return stored as QrisVoiceProfile
  } catch {
    // Use the bundled default if local storage is unavailable.
  }
  return 'male_deep'
}

export function saveQrisVoiceProfile(profile: QrisVoiceProfile) {
  try {
    localStorage.setItem(QRIS_VOICE_PROFILE_KEY, profile)
  } catch {
    // The selected profile is still used for this preview if persistence is unavailable.
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(value => {
      window.clearTimeout(timer)
      resolve(value)
    }, error => {
      window.clearTimeout(timer)
      reject(error)
    })
  })
}

function speakWithWebView(text: string, profile: QrisVoiceProfile) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return Promise.reject(new Error('Audio aplikasi dan Text-to-Speech WebView tidak tersedia.'))
  }

  return new Promise<void>((resolve, reject) => {
    const synthesis = window.speechSynthesis
    const utterance = new SpeechSynthesisUtterance(text)
    const shape = VOICE_SHAPES[profile]
    utterance.lang = 'id-ID'
    utterance.volume = 1
    utterance.pitch = shape.pitch
    utterance.rate = shape.rate
    const timer = window.setTimeout(() => {
      synthesis.cancel()
      reject(new Error('WebView tidak menyelesaikan suara Text-to-Speech.'))
    }, 15_000)

    utterance.onend = () => {
      window.clearTimeout(timer)
      resolve()
    }
    utterance.onerror = event => {
      window.clearTimeout(timer)
      reject(new Error('WebView gagal memutar Text-to-Speech (' + event.error + ').'))
    }
    synthesis.speak(utterance)
  })
}

function indonesianNumberWords(value: number): string {
  const words = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']
  if (value < 12) return words[value]
  if (value < 20) return indonesianNumberWords(value - 10) + ' belas'
  if (value < 100) {
    const remainder = value % 10
    return indonesianNumberWords(Math.floor(value / 10)) + ' puluh' + (remainder ? ' ' + indonesianNumberWords(remainder) : '')
  }
  if (value < 200) return 'seratus' + (value % 100 ? ' ' + indonesianNumberWords(value - 100) : '')
  if (value < 1_000) {
    const remainder = value % 100
    return indonesianNumberWords(Math.floor(value / 100)) + ' ratus' + (remainder ? ' ' + indonesianNumberWords(remainder) : '')
  }
  if (value < 2_000) return 'seribu' + (value % 1_000 ? ' ' + indonesianNumberWords(value - 1_000) : '')
  if (value < 1_000_000) {
    const remainder = value % 1_000
    return indonesianNumberWords(Math.floor(value / 1_000)) + ' ribu' + (remainder ? ' ' + indonesianNumberWords(remainder) : '')
  }
  if (value < 1_000_000_000) {
    const remainder = value % 1_000_000
    return indonesianNumberWords(Math.floor(value / 1_000_000)) + ' juta' + (remainder ? ' ' + indonesianNumberWords(remainder) : '')
  }
  return String(value)
}

async function speakText(text: string, profile: QrisVoiceProfile) {
  if (!Capacitor.isNativePlatform()) {
    await speakWithWebView(text, profile)
    return
  }

  try {
    await withTimeout(
      PaymentSpeech.speak({ text, profile }),
      15_000,
      'Audio media Android tidak menyelesaikan suara Text-to-Speech.',
    )
  } catch (nativeError) {
    try {
      await speakWithWebView(text, profile)
    } catch (webViewError) {
      const nativeMessage = nativeError instanceof Error ? nativeError.message : 'Audio media Android gagal.'
      const webViewMessage = webViewError instanceof Error ? webViewError.message : 'Mesin TTS WebView gagal.'
      throw new Error(nativeMessage + ' ' + webViewMessage)
    }
  }
}

export async function speakQrisPaymentReceived(amount: number, profile = getQrisVoiceProfile()) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return
  const amountWords = indonesianNumberWords(amount)
  await speakText('Pembayaran Berhasil Melalui QRIS sebesar ' + amountWords + ' rupiah.', profile)
}

export async function previewQrisPaymentVoice(profile: QrisVoiceProfile) {
  await speakQrisPaymentReceived(150_000, profile)
}
