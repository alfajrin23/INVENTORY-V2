import { Capacitor, registerPlugin } from '@capacitor/core'

type PaymentSpeechPlugin = {
  speak(options: { text: string }): Promise<void>
}

const PaymentSpeech = registerPlugin<PaymentSpeechPlugin>('ABPaymentSpeech')

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
  await PaymentSpeech.speak({
    text: `Pembayaran QRIS berhasil diterima sebesar ${amountWords} rupiah.`,
  })
}
