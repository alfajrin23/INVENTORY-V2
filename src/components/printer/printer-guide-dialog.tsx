import { Bluetooth, CheckCircle2, Printer, ScanLine, Settings, Smartphone } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const steps = [
  ['Nyalakan printer', 'Nyalakan XANTRI BT-58D PRO dan pastikan kertas 58 mm terpasang.', Printer],
  ['Aktifkan Bluetooth', 'Nyalakan Bluetooth pada HP Android.', Bluetooth],
  ['Buka Inventory V2', 'Masuk ke aplikasi Inventory V2 seperti biasa.', Smartphone],
  ['Buka Pengaturan', 'Pilih Pengaturan → Printer Thermal.', Settings],
  ['Cari printer', 'Tekan Cari Printer. XANTRI akan diprioritaskan bila terdeteksi.', ScanLine],
  ['Pilih XANTRI', 'Pilih XANTRI BT-58D PRO dari daftar perangkat.', Printer],
  ['Setujui pairing', 'Jika Android menampilkan permintaan pairing, tekan Pasangkan/Pair.', Bluetooth],
  ['Tunggu Terhubung', 'Tunggu sampai status berubah menjadi Terhubung.', CheckCircle2],
  ['Test Print', 'Tekan Test Print untuk memastikan koneksi dan kertas benar.', Printer],
  ['Selesai', 'Berikutnya cukup tekan Print dari transaksi. Tidak perlu memilih printer lagi.', CheckCircle2],
] as const

export function PrinterGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-white/12 bg-[#121827]/98 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-white">
            <Printer className="size-5 text-cyan-200" />
            Cara menghubungkan printer
          </DialogTitle>
          <DialogDescription className="text-white/62">
            Pairing hanya perlu dilakukan pertama kali pada setiap HP. Setelah itu Inventory V2 mengingat printer ini secara lokal.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-2" aria-label="Langkah menghubungkan printer thermal">
          {steps.map(([title, detail, Icon], index) => (
            <li key={title} className="flex min-h-16 gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-300/12 text-cyan-100" aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">{index + 1}. {title}</span>
                <span className="mt-1 block text-sm leading-5 text-white/64">{detail}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-sm leading-5 text-amber-100">
          Printer dapat dipakai bergantian oleh beberapa HP. Jika sedang dipakai HP lain, tunggu cetakan selesai lalu coba Hubungkan &amp; Cetak lagi.
        </p>

        <DialogFooter>
          <Button type="button" className="min-h-11" onClick={() => onOpenChange(false)}>
            Mengerti
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
