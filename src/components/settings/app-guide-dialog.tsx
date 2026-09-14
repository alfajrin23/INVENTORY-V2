import {
  ArrowDownUp,
  Barcode,
  BarChart3,
  Bell,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  FileText,
  History,
  MessageCircle,
  Mic,
  Package,
  PackagePlus,
  ScanLine,
  Search,
  Settings,
  SlidersHorizontal,
  Store,
  X,
} from 'lucide-react'
import type { ComponentType } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type AppGuideDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const quickGuides = [
  { icon: Search, label: 'Cari barang', text: 'Cari nama, merek, atau barcode dari Data Barang.' },
  { icon: ScanLine, label: 'Scanner', text: 'Scan barcode untuk transaksi cepat atau draft barang baru.' },
  { icon: Mic, label: 'Voice AI', text: 'Ucapkan barang masuk, barang keluar, tambah barang, atau koreksi.' },
  { icon: BarChart3, label: 'Grafik', text: 'Pantau pendapatan keluar 7 hari terakhir.' },
  { icon: FileText, label: 'Laporan', text: 'Buka laporan pendapatan, barang masuk, keluar, dan stok.' },
  { icon: Settings, label: 'Pengaturan', text: 'Atur toko, akun, tema, notifikasi, dan panduan.' },
]

function SearchScreenshot() {
  return (
    <div className="guide-phone-shot" aria-label="Contoh tampilan search Data Barang">
      <div className="guide-shot-header">
        <span>Data barang</span>
        <span className="guide-dot" />
      </div>
      <div className="guide-search-field">
        <Search className="size-4" />
        <span>charger, brand, barcode</span>
        <ScanLine className="size-4" />
      </div>
      <div className="guide-chip-row">
        <span className="active">Semua</span>
        <span>Stok rendah</span>
        <span>Habis</span>
      </div>
      <div className="guide-product-card">
        <span className="guide-product-symbol"><Package className="size-4" /></span>
        <span>
          <strong>Charger USB-C 33W</strong>
          <small>Anker - 8991001000011</small>
        </span>
        <b>Aman</b>
      </div>
    </div>
  )
}

function ProductDropdownScreenshot() {
  return (
    <div className="guide-phone-shot" aria-label="Contoh dropdown urutan Data Barang">
      <div className="guide-shot-header">
        <span>Data barang</span>
        <ArrowDownUp className="size-4" />
      </div>
      <div className="guide-dropdown-field">
        <span>Urutkan: Stok terendah</span>
        <ChevronDown className="size-4" />
      </div>
      <div className="guide-dropdown-menu">
        <span>A-Z</span>
        <span className="selected">Stok terendah</span>
        <span>Harga tertinggi</span>
        <span>Barcode terbaru</span>
      </div>
    </div>
  )
}

function DashboardChartScreenshot() {
  const bars = [38, 58, 68, 50, 76, 66, 92]

  return (
    <div className="guide-phone-shot" aria-label="Contoh grafik pendapatan dashboard">
      <div className="guide-shot-header">
        <span>Ringkasan toko</span>
        <span>Hari ini</span>
      </div>
      <div className="guide-revenue-card">
        <small>Pendapatan hari ini</small>
        <strong>Rp 2.450.000</strong>
      </div>
      <div className="guide-chart">
        {bars.map((height, index) => (
          <span key={index} className={index === bars.length - 1 ? 'active' : ''} style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="guide-chart-labels">
        <span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span>
      </div>
    </div>
  )
}

function ScannerScreenshot() {
  return (
    <div className="guide-scanner-shot" aria-label="Contoh tampilan scanner barcode">
      <div className="guide-scanner-top">
        <ScanLine className="size-4" />
        <span>Scanner aktif</span>
      </div>
      <div className="guide-scan-frame">
        <div className="guide-barcode-image" aria-hidden="true">
          {[5, 11, 4, 15, 7, 3, 13, 5, 10, 4, 14, 6, 9, 4, 12, 7, 3, 11].map((width, index) => (
            <span key={index} style={{ width: `${width}px` }} />
          ))}
        </div>
        <span className="guide-scanline" />
      </div>
      <p>Arahkan barcode ke kotak sampai garis melewati kode.</p>
    </div>
  )
}

function VoiceScreenshot() {
  return (
    <div className="guide-phone-shot" aria-label="Contoh Voice AI">
      <div className="guide-shot-header">
        <span>Voice AI</span>
        <Mic className="size-4" />
      </div>
      <div className="guide-voice-orb"><Mic className="size-5" /></div>
      <div className="guide-voice-wave" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => <span key={index} style={{ animationDelay: `${index * 75}ms` }} />)}
      </div>
      <p>"barang masuk charger Anker sepuluh"</p>
    </div>
  )
}

function StepList({ items }: { items: string[] }) {
  return (
    <ol className="guide-step-list">
      {items.map((item, index) => (
        <li key={item}>
          <span>{index + 1}</span>
          <p>{item}</p>
        </li>
      ))}
    </ol>
  )
}

function SymbolList({ items }: { items: { icon: ComponentType<{ className?: string }>; title: string; text: string }[] }) {
  return (
    <div className="guide-symbol-grid">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div key={item.title} className="guide-symbol-item">
            <Icon className="size-4" />
            <span>
              <strong>{item.title}</strong>
              <small>{item.text}</small>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function AppGuideDialog({ open, onOpenChange }: AppGuideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="app-guide-dialog border-white/12 bg-[#101827]/98 p-0 text-white shadow-2xl sm:max-w-5xl">
        <DialogHeader className="app-guide-header">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-300/12 text-emerald-100">
            <BookOpenCheck className="size-6" />
          </div>
          <div>
            <DialogTitle className="text-white">Panduan ABElektronik Inventory</DialogTitle>
            <DialogDescription className="text-white/65">
              Cara memakai fitur utama aplikasi dari cari barang, transaksi, scanner, voice, laporan, sampai pengaturan.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="app-guide-body">
          <section className="guide-hero-panel" aria-label="Ringkasan fitur">
            <div>
              <p className="guide-eyebrow">Mulai dari sini</p>
              <h2>Gunakan aplikasi lewat tombol, simbol, pencarian, scan barcode, atau suara.</h2>
              <p>Semua transaksi tetap perlu dicek sebelum disimpan, jadi stok tidak berubah sebelum user menekan konfirmasi.</p>
            </div>
            <div className="guide-quick-grid">
              {quickGuides.map((item) => {
                const Icon = item.icon
                return (
                  <article key={item.label}>
                    <Icon className="size-4" />
                    <strong>{item.label}</strong>
                    <span>{item.text}</span>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="app-guide-section">
            <div className="guide-copy">
              <p className="guide-eyebrow">Data Barang</p>
              <h3>Search dipakai untuk menemukan barang lebih cepat.</h3>
              <p>Ketik nama barang, merek, atau angka barcode. Tombol scanner di kanan kolom search membuka kamera untuk membaca barcode tanpa mengetik.</p>
              <SymbolList
                items={[
                  { icon: Search, title: 'Search', text: 'Cari nama, merek, atau barcode.' },
                  { icon: ScanLine, title: 'Scan', text: 'Baca barcode lewat kamera.' },
                  { icon: SlidersHorizontal, title: 'Filter', text: 'Lihat semua, stok rendah, atau habis.' },
                ]}
              />
            </div>
            <SearchScreenshot />
          </section>

          <section className="app-guide-section">
            <div className="guide-copy">
              <p className="guide-eyebrow">Dropdown Data Barang</p>
              <h3>Dropdown mengatur urutan daftar, bukan mengubah stok.</h3>
              <p>Pakai dropdown saat daftar produk panjang. Pilih A-Z untuk mencari alfabetis, stok terendah untuk prioritas restok, harga tertinggi untuk nilai jual besar, atau barcode untuk audit label.</p>
              <SymbolList
                items={[
                  { icon: ArrowDownUp, title: 'Urutkan', text: 'Mengubah susunan daftar.' },
                  { icon: ChevronDown, title: 'Dropdown', text: 'Buka pilihan urutan.' },
                  { icon: Barcode, title: 'Barcode', text: 'Cocok untuk cek label fisik.' },
                ]}
              />
            </div>
            <ProductDropdownScreenshot />
          </section>

          <section className="app-guide-section">
            <div className="guide-copy">
              <p className="guide-eyebrow">Dashboard</p>
              <h3>Grafik dashboard menunjukkan pendapatan barang keluar 7 hari terakhir.</h3>
              <p>Batang paling tinggi berarti nilai penjualan hari itu lebih besar. Angka pendapatan hari ini dihitung dari transaksi keluar, sementara kartu Produk, Transaksi, dan Stok rendah membantu melihat kondisi toko sekilas.</p>
              <SymbolList
                items={[
                  { icon: BarChart3, title: 'Grafik', text: 'Pendapatan harian 7 hari.' },
                  { icon: Package, title: 'Produk', text: 'Jumlah item aktif.' },
                  { icon: Bell, title: 'Stok rendah', text: 'Barang yang perlu restok.' },
                ]}
              />
            </div>
            <DashboardChartScreenshot />
          </section>

          <section className="app-guide-section">
            <div className="guide-copy">
              <p className="guide-eyebrow">Scanner & Barcode</p>
              <h3>Scanner dipakai untuk membaca barcode barang lewat kamera.</h3>
              <StepList
                items={[
                  'Tekan tombol Scan dari Home, Data Barang, atau form transaksi.',
                  'Izinkan kamera saat Android meminta izin.',
                  'Arahkan barcode ke kotak scanner sampai garis animasi melewati kode.',
                  'Jika barang ditemukan, pilih untuk transaksi. Jika belum ada, barcode dipakai sebagai draft barang baru.',
                ]}
              />
            </div>
            <ScannerScreenshot />
          </section>

          <section className="app-guide-section">
            <div className="guide-copy">
              <p className="guide-eyebrow">Transaksi & Voice AI</p>
              <h3>Barang masuk menambah stok, barang keluar mengurangi stok.</h3>
              <p>Gunakan tombol Masuk/Keluar untuk input manual, atau Voice AI untuk mengucapkan transaksi. Contoh: "barang masuk charger Anker sepuluh", "jual lampu Philips dua", atau "tambah barang nama Kabel HDMI stok 12 harga 35000 barcode 899123".</p>
              <SymbolList
                items={[
                  { icon: PackagePlus, title: 'Masuk', text: 'Restok dan penambahan.' },
                  { icon: CheckCircle2, title: 'Konfirmasi', text: 'Stok berubah setelah disimpan.' },
                  { icon: Mic, title: 'Voice AI', text: 'Input cepat dengan suara.' },
                ]}
              />
            </div>
            <VoiceScreenshot />
          </section>

          <section className="guide-wide-panel">
            <div>
              <p className="guide-eyebrow">Fitur lainnya</p>
              <h3>Riwayat, laporan, profil toko, dan logs membantu mengecek pekerjaan harian.</h3>
            </div>
            <div className="guide-feature-list">
              <article><History className="size-5" /><strong>History Barang</strong><span>Lihat riwayat barang masuk/keluar, koreksi transaksi, dan jejak stok.</span></article>
              <article><FileText className="size-5" /><strong>Laporan</strong><span>Buka pendapatan harian, mingguan, bulanan, tahunan, barang masuk, barang keluar, dan stok.</span></article>
              <article><MessageCircle className="size-5" /><strong>Ringkasan WhatsApp</strong><span>Siapkan ringkasan toko untuk dibagikan ke WhatsApp.</span></article>
              <article><Store className="size-5" /><strong>Profil & Toko</strong><span>Kelola nama toko, alamat, foto, dan toko aktif jika memakai banyak toko.</span></article>
              <article><Barcode className="size-5" /><strong>Cetak Barcode</strong><span>Pilih produk di Data Barang lalu cetak/download barcode untuk label fisik.</span></article>
              <article><Settings className="size-5" /><strong>Logs Input</strong><span>Lihat catatan perubahan data untuk audit input.</span></article>
            </div>
          </section>
        </div>

        <DialogFooter className="app-guide-footer">
          <Button type="button" onClick={() => onOpenChange(false)} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
            <X className="size-4" />
            Tutup Panduan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
