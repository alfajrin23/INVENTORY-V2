import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { PrinterSettingsPanel } from '@/components/printer/printer-settings-panel'
import { AppUpdateSettings } from '@/components/settings/app-update-settings'
import { QrisSettingsPanel } from '@/components/settings/qris-settings-panel'
import { QrisVoiceSettings } from '@/components/settings/qris-voice-settings'
import { Button } from '@/components/ui/button'
import { routes } from '@/lib/navigation'

function SettingsDetailLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-start gap-3">
        <Button asChild type="button" variant="outline" aria-label="Kembali ke Pengaturan" className="mt-1 size-11 shrink-0 border-white/12 bg-white/[0.07] p-0 text-white hover:bg-white/12">
          <Link to={routes.settings}><ArrowLeft className="size-4" /></Link>
        </Button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Pengaturan</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-white/55">{description}</p>
        </div>
      </header>
      {children}
    </div>
  )
}

export function AppUpdateSettingsPage() {
  return (
    <SettingsDetailLayout title="Update Aplikasi" description="Periksa dan pasang APK terbaru dari GitHub tanpa menghapus aplikasi atau data.">
      <AppUpdateSettings />
    </SettingsDetailLayout>
  )
}

export function QrisVoiceSettingsPage() {
  return (
    <SettingsDetailLayout title="Suara Konfirmasi QRIS" description="Pilih karakter suara dan dengarkan contoh pengumuman pembayaran QRIS.">
      <QrisVoiceSettings />
    </SettingsDetailLayout>
  )
}

export function QrisSettingsPage() {
  return (
    <SettingsDetailLayout title="Pengaturan QRIS" description="Kelola gambar QRIS dasar yang dipakai untuk membuat nominal dinamis.">
      <QrisSettingsPanel />
    </SettingsDetailLayout>
  )
}

export function PrinterSettingsPage() {
  return (
    <SettingsDetailLayout title="Printer Thermal" description="Hubungkan dan atur printer untuk mencetak struk transaksi.">
      <PrinterSettingsPanel />
    </SettingsDetailLayout>
  )
}
