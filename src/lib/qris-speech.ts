import { Capacitor, registerPlugin } from '@capacitor/core'

type PaymentSpeechPlugin = {
  speak(options: { text: string }): Promise<void>
}

const PaymentSpeech = registerPlugin<PaymentSpeechPlugin>('ABPaymentSpeech')

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

function speakWithWebView(text: string) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return Promise.reject(new Error('Suara Text-to-Speech Android dan WebView tidak tersedia.'))
  }

  return new Promise<void>((resolve, reject) => {
    const synthesis = window.speechSynthesis
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'id-ID'
    utterance.volume = 1
    utterance.rate = 0.95
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
      reject(new Error(`WebView gagal memutar Text-to-Speech (${event.error}).`))
    }
    synthesis.speak(utterance)
  })
}

function indonesianNumberWords(value: number): string {
  const words = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']
  if (value < 12) return words[value]
  if (value < 20) return `${indonesianNumberWords(value - 10)} belas`
  if (value < 100) {
    const remainder = value % 10
    return `${indonesianNumberWords(Math.floor(value / 10))} puluh${remainder ? ` ${indonesianNumberWords(remainder)}` : ''}`
  }
  if (value < 200) return `seratus${value % 100 ? ` ${indonesianNumberWords(value - 100)}` : ''}`
  if (value < 1_000) {
    const remainder = value % 100
    return `${indonesianNumberWords(Math.floor(value / 100))} ratus${remainder ? ` ${indonesianNumberWords(remainder)}` : ''}`
  }
  if (value < 2_000) return `seribu${value % 1_000 ? ` ${indonesianNumberWords(value - 1_000)}` : ''}`
  if (value < 1_000_000) {
    const remainder = value % 1_000
    return `${indonesianNumberWords(Math.floor(value / 1_000))} ribu${remainder ? ` ${indonesianNumberWords(remainder)}` : ''}`
  }
  if (value < 1_000_000_000) {
    const remainder = value % 1_000_000
    return `${indonesianNumberWords(Math.floor(value / 1_000_000))} juta${remainder ? ` ${indonesianNumberWords(remainder)}` : ''}`
  }
  return String(value)
}

export async function speakQrisPaymentReceived(amount: number) {
  if (!Capacitor.isNativePlatform() || !Number.isSafeInteger(amount) || amount <= 0) return

  const amountWords = indonesianNumberWords(amount)
  const text = `Pembayaran QRIS berhasil diterima sebesar ${amountWords} rupiah.`
  try {
    await withTimeout(
      PaymentSpeech.speak({ text }),
      15_000,
      'Android tidak menyelesaikan suara Text-to-Speech.',
    )
  } catch (nativeError) {
    try {
      await speakWithWebView(text)
    } catch (webViewError) {
      const nativeMessage = nativeError instanceof Error ? nativeError.message : 'Mesin TTS Android gagal.'
      const webViewMessage = webViewError instanceof Error ? webViewError.message : 'Mesin TTS WebView gagal.'
      throw new Error(`${nativeMessage} ${webViewMessage}`)
    }
  }
}
