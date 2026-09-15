import { Bluetooth, CheckCircle2, LoaderCircle, Printer, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { PrinterGuideDialog } from '@/components/printer/printer-guide-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ABThermalPrinter,
  isNativeAndroid,
  saveDefaultThermalPrinter,
  type ThermalPrinterDevice,
} from '@/lib/thermal-printer'

export function PrinterSetupDialog({
  open,
  onOpenChange,
  onConnected,
  pendingPrint = false,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onConnected?(device: ThermalPrinterDevice): void | Promise<void>
  pendingPrint?: boolean
}) {
  const [devices, setDevices] = useState<ThermalPrinterDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [connecting, setConnecting] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setDevices([])
      setScanning(false)
      setConnecting('')
      setError('')
      setNotice('')
    }
  }, [open])

  const scan = async () => {
    if (scanning) return
    setError('')
    setNotice('')
    if (!isNativeAndroid()) {
      setError('Pencarian Bluetooth langsung tersedia di APK Android. Pada web, gunakan Print browser atau PDF.')
      return
    }

    setScanning(true)
    try {
      const permission = await ABThermalPrinter.requestBluetoothPermissions()
      if (!permission.granted) {
        setError('Izin perangkat Bluetooth belum diberikan. Izinkan “Perangkat di sekitar” lalu coba lagi.')
        return
      }
      const state = await ABThermalPrinter.getBluetoothState()
      if (!state.enabled) {
        setError('Bluetooth HP belum aktif. Aktifkan Bluetooth, lalu tekan Cari Printer lagi.')
        return
      }

      const paired = await ABThermalPrinter.getPairedPrinters().catch(() => ({ devices: [] }))
      setDevices(paired.devices)
      const found = await ABThermalPrinter.discoverPrinters()
      const merged = new Map<string, ThermalPrinterDevice>()
      for (const device of [...paired.devices, ...found.devices]) merged.set(device.address, device)
      setDevices([...merged.values()])
      if (!merged.size) setNotice('Belum ada printer ditemukan. Pastikan printer menyala dan dekat dengan HP.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pencarian printer gagal. Coba lagi.')
    } finally {
      setScanning(false)
    }
  }

  const connect = async (device: ThermalPrinterDevice) => {
    if (connecting) return
    setConnecting(device.address)
    setError('')
    setNotice('')
    try {
      await ABThermalPrinter.connect({ address: device.address })
      await saveDefaultThermalPrinter(device)
      if (navigator.vibrate) navigator.vibrate(40)
      setNotice(`${device.name} terhubung dan menjadi printer default.`)
      await onConnected?.(device)
      if (!pendingPrint) window.setTimeout(() => onOpenChange(false), 500)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Printer tidak dapat dihubungkan. Pastikan printer menyala dan pairing Android disetujui.')
    } finally {
      setConnecting('')
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-white/12 bg-[#121827]/98 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-white">
              <Printer className="size-5 text-cyan-200" />
              {pendingPrint ? 'Hubungkan printer untuk mencetak' : 'Hubungkan Printer Thermal'}
            </DialogTitle>
            <DialogDescription className="text-white/62">
              Pilih XANTRI BT-58D PRO atau printer ESC/POS Bluetooth 58 mm Anda. Pengaturan disimpan hanya di HP ini.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/12 text-cyan-100">
                <Bluetooth className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-white">Bluetooth · 58 mm</p>
                <p className="text-sm text-white/58">XANTRI akan muncul paling atas bila terdeteksi.</p>
              </div>
            </div>
            <Button
              type="button"
              className="mt-4 min-h-12 w-full bg-cyan-300 text-base font-bold text-slate-950 hover:bg-cyan-200"
              onClick={() => void scan()}
              disabled={scanning || Boolean(connecting)}
              aria-label="Cari Printer Bluetooth"
            >
              {scanning ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" /> : devices.length ? <RefreshCw className="size-5" /> : <Search className="size-5" />}
              {scanning ? 'Mencari printer…' : devices.length ? 'Cari Lagi' : 'Cari Printer'}
            </Button>
          </div>

          {devices.length > 0 ? (
            <div className="space-y-2" role="list" aria-label="Printer Bluetooth ditemukan">
              <p className="text-sm font-semibold text-white/70">{devices.length} perangkat ditemukan</p>
              {devices.map(device => {
                const busy = connecting === device.address
                return (
                  <button
                    key={device.address}
                    type="button"
                    role="listitem"
                    onClick={() => void connect(device)}
                    disabled={Boolean(connecting)}
                    className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-white/12 bg-black/20 px-4 py-3 text-left outline-none transition hover:border-cyan-200/35 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:opacity-60"
                    aria-label={`Hubungkan ${device.name}`}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-white">
                      {busy ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" /> : <Printer className="size-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-base text-white">{device.name}</strong>
                      <small className="mt-1 block text-sm text-white/52">{device.bonded ? 'Sudah dipasangkan · tekan untuk hubungkan' : 'Tekan untuk pairing & hubungkan'}</small>
                    </span>
                    {busy ? <span className="text-sm text-cyan-100">Menghubungkan…</span> : null}
                  </button>
                )
              })}
            </div>
          ) : null}

          {notice ? (
            <div role="status" className="flex gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-3 text-sm text-emerald-100">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <span>{notice}{pendingPrint ? ' Resi akan dicetak otomatis.' : ''}</span>
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="flex gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-sm text-amber-100">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="min-h-11 w-full rounded-xl text-sm font-semibold text-cyan-100 outline-none hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            Cara menghubungkan printer
          </button>
        </DialogContent>
      </Dialog>
      <PrinterGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  )
}
