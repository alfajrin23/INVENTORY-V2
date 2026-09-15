import { BookOpen, BookOpenCheck, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { InteractiveGuide } from '@/components/guide/interactive-guide'
import { PrinterSettingsPanel } from '@/components/printer/printer-settings-panel'
import { AppGuideDialog } from '@/components/settings/app-guide-dialog'
import { GlassPanel } from '@/components/shared/glass-panel'
import { routes } from '@/lib/navigation'
import { SettingsPage } from '@/pages/settings-page'
import { VoiceGuidePage } from '@/pages/voice-guide-page'

export function SettingsWithGuidePage() {
  const [guideOpen, setGuideOpen] = useState(false)
  const [appGuideOpen, setAppGuideOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const voiceGuideRequested = new URLSearchParams(location.search).get('guide') === 'voice'

  if (voiceGuideRequested) {
    return (
      <VoiceGuidePage
        onBack={() => navigate(routes.settings, { replace: true })}
        onOpenFullGuide={() => {
          navigate(routes.settings, { replace: true })
          setGuideOpen(true)
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <SettingsPage />
      <PrinterSettingsPanel />

      <div className="guide-settings-access lg:hidden">
        <p className="mobile-section-eyebrow">PANDUAN</p>
        <div className="settings-group">
          <button
            type="button"
            className="settings-row"
            aria-label="Panduan Penggunaan"
            onClick={() => setGuideOpen(true)}
          >
            <span className="settings-icon incoming"><BookOpen /></span>
            <span>
              <strong>Panduan Penggunaan</strong>
              <small>Tur visual tombol, fitur, Voice AI, scanner, laporan & PDF</small>
            </span>
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            className="settings-row"
            aria-label="Panduan Aplikasi"
            onClick={() => setAppGuideOpen(true)}
          >
            <span className="settings-icon incoming"><BookOpenCheck /></span>
            <span>
              <strong>Panduan aplikasi</strong>
              <small>Cara pakai search, scanner, grafik, voice, dan laporan</small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <GlassPanel className="hidden max-w-2xl divide-y divide-white/10 p-2 lg:block" glow="emerald">
        <button
          type="button"
          aria-label="Panduan Penggunaan"
          onClick={() => setGuideOpen(true)}
          className="flex w-full items-center justify-between rounded-xl px-4 py-4 text-left transition hover:bg-white/[0.07]"
        >
          <span className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-300/12 text-emerald-100">
              <BookOpen className="size-5" />
            </span>
            <span>
              <span className="block font-semibold text-white">Panduan Penggunaan</span>
              <span className="text-sm text-white/52">Interactive product tour untuk seluruh fitur inventory</span>
            </span>
          </span>
          <ChevronRight className="size-4 text-white/48" />
        </button>
        <button
          type="button"
          aria-label="Panduan Aplikasi"
          onClick={() => setAppGuideOpen(true)}
          className="flex w-full items-center justify-between rounded-xl px-4 py-4 text-left transition hover:bg-white/[0.07]"
        >
          <span className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-300/12 text-emerald-100">
              <BookOpenCheck className="size-5" />
            </span>
            <span>
              <span className="block font-semibold text-white">Panduan aplikasi</span>
              <span className="text-sm text-white/52">Search, scanner, grafik, voice, laporan</span>
            </span>
          </span>
          <ChevronRight className="size-4 text-white/48" />
        </button>
      </GlassPanel>

      <InteractiveGuide open={guideOpen} onOpenChange={setGuideOpen} />
      <AppGuideDialog open={appGuideOpen} onOpenChange={setAppGuideOpen} />
    </div>
  )
}
