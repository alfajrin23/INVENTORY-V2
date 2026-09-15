import { Bluetooth, CheckCircle2, Circle, HelpCircle, LoaderCircle, Printer, PrinterCheck, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { PrinterGuideDialog } from '@/components/printer/printer-guide-dialog'
import { PrinterSetupDialog } from '@/components/printer/printer-setup-dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
  ABThermalPrinter,
  ensureThermalPrinterReady,
  forgetThermalPrinter,
  getSavedThermalPrinter,
  getThermalPrinterPreferences,
  isNativeAndroid,
  saveThermalPrinterPreferences,
  type ThermalPrinterDevice,
  type ThermalPrinterPreferences,
} from '@/lib/thermal-printer'

export function PrinterSettingsPanel() {
  const { showToast } = useToast()
  const [saved, setSaved] = useState<ThermalPrinterDevice | null>(null)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [preferences, setPreferences] = useState<ThermalPrinterPreferences>(() => getThermalPrinterPreferences())

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    try {
      const printer = await getSavedThermalPrinter()
      setSaved(printer)
      if (!printer || !isNativeAndroid()) {
        setConnected(false)
        return
      }
      const status = await ABThermalPrinter.getConnectionStatus()
      setConnected(Boolean(status.connected && status.address === printer.address))
    } catch {
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    const onVisible = () => { if (!document.hidden) void refreshStatus() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshStatus])

  const updatePreference = (key: keyof ThermalPrinterPreferences, value: boolean) => {
    const next = { ...preferences, [key]: value }
    setPreferences(next)
    saveThermalPrinterPreferences(next)
  }

  const testPrint = async () => {
    if (testing) return
    setTesting(true)
    try {
      await ensureThermalPrinterReady()
      await ABThermalPrinter.testPrint()
      setConnected(true)
      if (navigator.vibrate) navigator.vibrate([35, 30, 35])
      showToast('Test Print berhasil dikirim ke printer', 'success')
    } catch (cause) {
      setConnected(false)
      showToast(cause instanceof Error ? cause.message : 'Test Print gagal', 'error')
    } finally {
      setTesting(false)
    }
  }

  const forget = async () => {
    if (!saved) return
    if (!window.confirm(`Lupakan printer ${saved.name}?`)) return
    try {
      await forgetThermalPrinter()
      setSaved(null)
      setConnected(false)
      showToast('Printer default dilupakan dari HP ini', 'success')
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Printer gagal dilupakan', 'error')
    }
  }

  const onConnected = async (device: ThermalPrinterDevice) => {
    setSaved(device)
    setConnected(true)
    await refreshStatus()
  }

  const status = loading ? 'Memeriksa…' : connected ? 'Terhubung' : saved ? 'Siap dihubungkan' : 'Belum terhubung'

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-lg shadow-black/5 sm:p-5" aria-labelledby="printer-settings-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/12 text-cyan-100">
            <Printer className="size-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-100/65">Pengaturan Printer</p>
            <h2 id="printer-settings-title" className="mt-1 text-xl font-bold text-white">Printer Thermal</h2>
            <p className="mt-1 text-sm text-white/58">Direct Bluetooth ESC/POS · kertas 58 mm</p>
          </div>
        </div>
        <div role="status" className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 text-sm font-semibold text-white">
          {loading ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : connected ? <CheckCircle2 className="size-4 text-emerald-300" /> : <Circle className="size-4 text-white/45" />}
          {status}
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/15 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/42">Printer</p>
          <p className="mt-1 font-bold text-white">{saved?.name ?? 'Belum dipilih'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/42">Ukuran</p>
          <p className="mt-1 font-bold text-white">58 mm</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/42">Koneksi</p>
          <p className="mt-1 flex items-center gap-1.5 font-bold text-white"><Bluetooth className="size-4" /> Bluetooth</p>
        </div>
      </div>

      {!isNativeAndroid() ? (
        <p className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] p-3 text-sm leading-5 text-cyan-100">
          Direct print Bluetooth digunakan dari APK Android. Versi web tetap memakai Print browser dan PDF seperti sebelumnya.
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button type="button" className="min-h-12 text-base" onClick={() => setSetupOpen(true)}>
          <Bluetooth className="size-5" />
          {saved ? 'Ganti Printer' : 'Cari Printer'}
        </Button>
        <Button type="button" variant="outline" className="min-h-12 border-white/15 bg-white/[0.04] text-base" onClick={() => void testPrint()} disabled={!saved || testing || !isNativeAndroid()}>
          {testing ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" /> : <PrinterCheck className="size-5" />}
          {testing ? 'Mencetak…' : 'Test Print'}
        </Button>
      </div>

      <fieldset className="mt-5 space-y-2">
        <legend className="mb-2 text-sm font-bold text-white">Saat mencetak</legend>
        <PreferenceRow
          label="Cetak barcode transaksi"
          detail="Kode transaksi tampil sebagai barcode."
          checked={preferences.printTransactionBarcode}
          onChange={value => updatePreference('printTransactionBarcode', value)}
        />
        <PreferenceRow
          label="Cetak QR transaksi"
          detail="QR transaksi dicetak dalam ukuran hemat kertas."
          checked={preferences.printTransactionQr}
          onChange={value => updatePreference('printTransactionQr', value)}
        />
        <PreferenceRow
          label="Auto reconnect"
          detail="Hubungkan kembali saat Print ditekan bila koneksi terputus."
          checked={preferences.autoReconnect}
          onChange={value => updatePreference('autoReconnect', value)}
        />
        <PreferenceRow
          label="Tampilkan harga pada barcode barang"
          detail="Harga ikut tercetak saat Cetak Barcode dari Data Barang."
          checked={preferences.showPriceOnProductBarcode}
          onChange={value => updatePreference('showPriceOnProductBarcode', value)}
        />
      </fieldset>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="ghost" className="min-h-11 justify-start text-cyan-100" onClick={() => setGuideOpen(true)}>
          <HelpCircle className="size-4" />
          Panduan Printer
        </Button>
        {saved ? (
          <Button type="button" variant="ghost" className="min-h-11 justify-start text-rose-200" onClick={() => void forget()}>
            <Trash2 className="size-4" />
            Lupakan Printer
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="min-h-11 justify-start text-white/65" onClick={() => void refreshStatus()}>
          <RotateCcw className="size-4" />
          Periksa Status
        </Button>
      </div>

      <PrinterSetupDialog open={setupOpen} onOpenChange={setSetupOpen} onConnected={onConnected} />
      <PrinterGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </section>
  )
}

function PreferenceRow({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5 outline-none focus-within:ring-2 focus-within:ring-cyan-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="size-5 shrink-0 accent-emerald-400"
      />
      <span className="min-w-0">
        <strong className="block text-sm text-white">{label}</strong>
        <small className="mt-0.5 block leading-4 text-white/50">{detail}</small>
      </span>
    </label>
  )
}
