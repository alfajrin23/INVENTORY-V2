import { Play, RefreshCw, Volume2 } from 'lucide-react'
import { useState } from 'react'

import { GlassPanel } from '@/components/shared/glass-panel'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
  getQrisVoiceProfile,
  PAYMENT_VOICE_PROFILES,
  previewQrisPaymentVoice,
  saveQrisVoiceProfile,
  type QrisVoiceProfile,
} from '@/lib/qris-speech'

export function QrisVoiceSettings() {
  const [profile, setProfile] = useState<QrisVoiceProfile>(() => getQrisVoiceProfile())
  const [previewing, setPreviewing] = useState(false)
  const { showToast } = useToast()
  const selectedVoice = PAYMENT_VOICE_PROFILES.find(voice => voice.id === profile) ?? PAYMENT_VOICE_PROFILES[3]

  const chooseVoice = (voice: QrisVoiceProfile) => {
    setProfile(voice)
    saveQrisVoiceProfile(voice)
  }

  const playExample = async () => {
    if (previewing) return
    setPreviewing(true)
    try {
      await previewQrisPaymentVoice(profile)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Contoh suara tidak dapat diputar.', 'error')
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <section aria-label="Suara konfirmasi QRIS">
      <GlassPanel className="space-y-4 p-4 sm:p-5" glow="cyan">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/12 text-cyan-100">
            <Volume2 className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold text-white">Suara Konfirmasi QRIS</h2>
            <p className="mt-1 text-sm leading-6 text-white/62">
              Pilih karakter suara untuk konfirmasi pembayaran. Contoh menggunakan nominal Rp150.000 dan diputar sebagai audio aplikasi.
            </p>
          </div>
        </div>

        <div role="group" aria-label="Pilihan suara pembayaran QRIS" className="grid gap-2 sm:grid-cols-2">
          {PAYMENT_VOICE_PROFILES.map(voice => (
            <button
              key={voice.id}
              type="button"
              aria-pressed={profile === voice.id}
              onClick={() => chooseVoice(voice.id)}
              className={'rounded-xl border p-3 text-left transition ' + (profile === voice.id
                ? 'border-cyan-200/55 bg-cyan-200/12 text-white'
                : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]')}
            >
              <strong className="block text-sm">{voice.label}</strong>
              <span className="mt-1 block text-xs leading-5 text-white/52">{voice.description}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={previewing} onClick={() => void playExample()} className="bg-cyan-200 text-slate-950 hover:bg-cyan-100">
            {previewing ? <RefreshCw className="size-4 animate-spin" /> : <Play className="size-4" />}
            {previewing ? 'Memutar contoh' : 'Putar contoh suara'}
          </Button>
          <span role="status" className="text-xs text-white/52">Terpilih: {selectedVoice.label}</span>
        </div>

        <p className="text-xs leading-5 text-white/45">
          Pilihan tersimpan di perangkat ini. Suara dasar dan ketersediaan bahasa Indonesia mengikuti mesin Text-to-Speech Android; nada dan tempo disesuaikan dengan tipe yang dipilih.
        </p>
      </GlassPanel>
    </section>
  )
}
