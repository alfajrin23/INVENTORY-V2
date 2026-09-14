import {
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Home,
  Mic,
  Moon,
  Package,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Printer,
  ScanLine,
  Search,
  Settings,
  Sun,
  TrendingUp,
  UserCog,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import './interactive-guide.css'

type GuideScene =
  | 'navigation'
  | 'dashboard'
  | 'search'
  | 'scanner'
  | 'products'
  | 'transaction'
  | 'chart'
  | 'reports'
  | 'print'
  | 'voice'
  | 'settings'

type GuideFeature = {
  id: GuideScene
  title: string
  shortTitle: string
  icon: LucideIcon
  location: string
  find: string
  purpose: string
  route: string
  steps: string[]
  result: string
}

const guideFeatures: GuideFeature[] = [
  {
    id: 'navigation',
    title: 'Kenali Tombol Utama',
    shortTitle: 'Navigasi',
    icon: Home,
    location: 'Bottom Navigation',
    find: 'Home, Barang, Voice AI, Laporan, dan Setelan',
    purpose: 'Berpindah ke bagian utama aplikasi tanpa mencari menu lain.',
    route: 'Lihat menu bawah pada layar mobile.',
    steps: ['Kenali bentuk setiap icon.', 'Perhatikan label di bawah icon.', 'Tekan menu tujuan yang ingin dibuka.'],
    result: 'Anda dapat berpindah halaman utama dengan cepat.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    shortTitle: 'Dashboard',
    icon: Home,
    location: 'Bottom Navigation · Home',
    find: 'Icon Home',
    purpose: 'Melihat pendapatan, produk, transaksi, stok rendah, grafik, dan aktivitas terbaru.',
    route: 'Bottom Navigation → Home.',
    steps: ['Tekan Home.', 'Baca kartu ringkasan toko.', 'Gunakan Aksi Cepat atau grafik bila diperlukan.'],
    result: 'Ringkasan kondisi toko tampil dalam satu layar.',
  },
  {
    id: 'search',
    title: 'Pencarian Produk',
    shortTitle: 'Search',
    icon: Search,
    location: 'Data Barang · bagian atas',
    find: 'Kolom “Nama, merek, atau barcode”',
    purpose: 'Mencari produk berdasarkan nama, brand, atau barcode.',
    route: 'Bottom Navigation → Barang → kolom pencarian.',
    steps: ['Tekan kolom pencarian.', 'Ketik contoh “Charger Samsung”.', 'Daftar barang otomatis tersaring.'],
    result: 'Produk yang cocok tampil tanpa perlu menggulir seluruh daftar.',
  },
  {
    id: 'scanner',
    title: 'Scanner Barcode',
    shortTitle: 'Scanner',
    icon: ScanLine,
    location: 'Data Barang · sisi kanan kolom pencarian / Aksi Cepat Dashboard',
    find: 'Icon ScanLine',
    purpose: 'Membaca barcode untuk menemukan produk dan memulai transaksi lebih cepat.',
    route: 'Barang → tekan icon scanner di kolom pencarian, atau Dashboard → Scan.',
    steps: ['Tekan Scanner.', 'Arahkan kamera ke barcode.', 'Tunggu garis scan mendeteksi kode.', 'Pilih produk yang ditemukan.'],
    result: 'Produk terdeteksi dan dapat diteruskan ke alur transaksi.',
  },
  {
    id: 'products',
    title: 'Data Barang',
    shortTitle: 'Barang',
    icon: Package,
    location: 'Bottom Navigation · Barang',
    find: 'Icon Package',
    purpose: 'Melihat stok, harga, barcode, menambah barang, edit, serta transaksi masuk/keluar.',
    route: 'Bottom Navigation → Barang.',
    steps: ['Tekan Barang.', 'Cari/filter produk bila perlu.', 'Gunakan Masuk, Keluar, Tambah, Edit, atau Barcode.'],
    result: 'Data produk dapat dikelola dari satu halaman.',
  },
  {
    id: 'transaction',
    title: 'Transaksi Barang Masuk & Keluar',
    shortTitle: 'Transaksi',
    icon: PackagePlus,
    location: 'Dashboard · Aksi Cepat / kartu produk',
    find: 'Masuk = PackagePlus, Keluar = PackageMinus',
    purpose: 'Menambah stok saat restock atau mengurangi stok saat penjualan.',
    route: 'Dashboard → Masuk/Keluar, atau Barang → pilih Masuk/Keluar pada kartu produk.',
    steps: ['Pilih Masuk atau Keluar.', 'Pastikan produk dan Qty benar.', 'Periksa jenis transaksi.', 'Tekan Proses (aksi Proceed/finalisasi).'],
    result: 'Stok dan history diperbarui, lalu dialog Transaksi selesai muncul.',
  },
  {
    id: 'chart',
    title: 'Grafik Pendapatan',
    shortTitle: 'Grafik',
    icon: BarChart3,
    location: 'Dashboard · Pendapatan 7 hari',
    find: 'Area chart Pendapatan 7 hari',
    purpose: 'Membaca tren pendapatan transaksi keluar selama tujuh hari.',
    route: 'Home → gulir ke “Pendapatan 7 hari”.',
    steps: ['Lihat tinggi bar per hari.', 'Tekan salah satu bar/hari.', 'Baca tanggal dan nilai terpilih di bawah chart.'],
    result: 'Pendapatan harian dapat dibandingkan secara visual.',
  },
  {
    id: 'reports',
    title: 'Laporan',
    shortTitle: 'Laporan',
    icon: TrendingUp,
    location: 'Bottom Navigation · Laporan',
    find: 'Icon TrendingUp',
    purpose: 'Membuka laporan pendapatan, barang masuk, barang keluar, dan stok.',
    route: 'Bottom Navigation → Laporan.',
    steps: ['Tekan Laporan.', 'Pilih jenis laporan dari Reports Hub.', 'Atur periode/filter pada halaman laporan.'],
    result: 'Laporan yang dipilih tampil dan siap disimpan sebagai PDF.',
  },
  {
    id: 'print',
    title: 'Print & PDF',
    shortTitle: 'Print/PDF',
    icon: Printer,
    location: 'Hasil transaksi / Resi Digital / halaman laporan',
    find: 'Printer untuk Print, FileText untuk Simpan PDF',
    purpose: 'Mencetak resi transaksi atau menyimpan resi/laporan menjadi PDF.',
    route: 'Selesaikan transaksi → Print/Lihat Resi, atau buka laporan → Simpan PDF.',
    steps: ['Kenali icon Print atau PDF.', 'Tekan Print untuk membuka cetak.', 'Tekan Lihat Resi → Save PDF untuk menyimpan resi.'],
    result: 'Dokumen siap dicetak atau disimpan sebagai file PDF.',
  },
  {
    id: 'voice',
    title: 'Voice AI',
    shortTitle: 'Voice AI',
    icon: Mic,
    location: 'Tombol tengah Bottom Navigation',
    find: 'Tombol bulat Mic',
    purpose: 'Menjalankan perintah transaksi inventory dengan suara dan tetap meminta konfirmasi sebelum stok berubah.',
    route: 'Tekan tombol Mic di tengah menu bawah.',
    steps: ['Tekan Mic.', 'Ucapkan “Barang masuk Charger Samsung 10”.', 'Periksa hasil Produk, Jenis, dan Qty.', 'Kenali lalu tekan tombol Konfirmasi.'],
    result: 'Stok dan history berubah hanya setelah Konfirmasi berhasil.',
  },
  {
    id: 'settings',
    title: 'Setelan & Panduan',
    shortTitle: 'Setelan',
    icon: Settings,
    location: 'Bottom Navigation · Setelan',
    find: 'Icon Settings',
    purpose: 'Mengatur tema, notifikasi, akun, profil, data/koneksi, dan membuka Panduan Penggunaan.',
    route: 'Bottom Navigation → Setelan.',
    steps: ['Tekan Setelan.', 'Pilih menu yang dibutuhkan.', 'Untuk manual ini, tekan Panduan Penggunaan.'],
    result: 'Pengaturan aplikasi dan panduan dapat diakses dari satu halaman.',
  },
]

const legend = [
  { label: 'Home', icon: Home },
  { label: 'Barang', icon: Package },
  { label: 'Voice AI', icon: Mic },
  { label: 'Laporan', icon: TrendingUp },
  { label: 'Scanner', icon: ScanLine },
  { label: 'Pencarian', icon: Search },
  { label: 'Setelan', icon: Settings },
  { label: 'Cetak', icon: Printer },
  { label: 'PDF', icon: FileText },
] as const

export function InteractiveGuide({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [activeId, setActiveId] = useState<GuideScene>('navigation')
  const [showLocation, setShowLocation] = useState(true)
  const activeIndex = guideFeatures.findIndex((item) => item.id === activeId)
  const active = guideFeatures[activeIndex] ?? guideFeatures[0]

  useEffect(() => {
    if (!open) return
    setActiveId('navigation')
    setShowLocation(true)
  }, [open])

  const move = (direction: -1 | 1) => {
    const nextIndex = Math.min(Math.max(activeIndex + direction, 0), guideFeatures.length - 1)
    setActiveId(guideFeatures[nextIndex].id)
    setShowLocation(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby="inventory-guide-description"
        className="guide-dialog-content"
        data-testid="interactive-guide"
      >
        <div className="guide-shell">
          <header className="guide-header">
            <div className="min-w-0">
              <p className="guide-eyebrow">PANDUAN INTERAKTIF</p>
              <DialogTitle className="guide-title">Panduan Penggunaan Inventory</DialogTitle>
              <DialogDescription id="inventory-guide-description" className="guide-description">
                Kenali tombolnya, lihat posisinya, tekan, lalu pelajari hasilnya.
              </DialogDescription>
            </div>
            <button type="button" className="guide-close" aria-label="Tutup Panduan" onClick={() => onOpenChange(false)}>
              <X size={20} />
            </button>
          </header>

          <div className="guide-mobile-tabs" aria-label="Daftar panduan">
            {guideFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <button
                  key={feature.id}
                  type="button"
                  className={cn('guide-tab', activeId === feature.id && 'is-active')}
                  onClick={() => { setActiveId(feature.id); setShowLocation(true) }}
                  aria-pressed={activeId === feature.id}
                >
                  <Icon size={16} />
                  <span>{feature.shortTitle}</span>
                </button>
              )
            })}
          </div>

          <div className="guide-layout">
            <aside className="guide-sidebar" aria-label="Bab panduan">
              {guideFeatures.map((feature, index) => {
                const Icon = feature.icon
                return (
                  <button
                    key={feature.id}
                    type="button"
                    className={cn('guide-sidebar-item', activeId === feature.id && 'is-active')}
                    onClick={() => { setActiveId(feature.id); setShowLocation(true) }}
                    aria-pressed={activeId === feature.id}
                  >
                    <span>{index + 1}</span>
                    <Icon size={17} />
                    <strong>{feature.shortTitle}</strong>
                  </button>
                )
              })}
            </aside>

            <main className="guide-content">
              {active.id === 'navigation' && (
                <section className="guide-legend" aria-labelledby="guide-legend-title">
                  <div>
                    <p className="guide-step-label">SIMBOL PENTING</p>
                    <h2 id="guide-legend-title">Kenali icon sebelum mulai</h2>
                  </div>
                  <div className="guide-legend-grid">
                    {legend.map(({ label, icon: Icon }) => (
                      <div key={label}>
                        <span><Icon /></span>
                        <small>{label}</small>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <GuideFeatureEntry
                key={active.id}
                feature={active}
                showLocation={showLocation}
                onShowLocation={() => setShowLocation((value) => !value)}
              />
            </main>
          </div>

          <footer className="guide-footer">
            <Button type="button" variant="outline" onClick={() => move(-1)} disabled={activeIndex === 0}>
              <ChevronLeft className="size-4" /> Sebelumnya
            </Button>
            <span>{activeIndex + 1} / {guideFeatures.length}</span>
            {activeIndex === guideFeatures.length - 1 ? (
              <Button type="button" onClick={() => onOpenChange(false)} className="bg-teal-700 text-white hover:bg-teal-600">
                <CheckCircle2 className="size-4" /> Tutup Panduan
              </Button>
            ) : (
              <Button type="button" onClick={() => move(1)} className="bg-teal-700 text-white hover:bg-teal-600">
                Berikutnya <ChevronRight className="size-4" />
              </Button>
            )}
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GuideFeatureEntry({
  feature,
  showLocation,
  onShowLocation,
}: {
  feature: GuideFeature
  showLocation: boolean
  onShowLocation: () => void
}) {
  const Icon = feature.icon

  return (
    <article className="guide-feature-entry">
      <section className="guide-recognition-card">
        <div className="guide-icon-preview"><Icon /></div>
        <div className="min-w-0">
          <p className="guide-step-label">1 · KENALI SIMBOL</p>
          <h2>{feature.title}</h2>
          <p><strong>Lokasi:</strong> {feature.location}</p>
          <p><strong>Cari:</strong> {feature.find}</p>
        </div>
        <button type="button" className="guide-locate-button" onClick={onShowLocation} aria-expanded={showLocation}>
          {showLocation ? 'Sembunyikan posisi' : 'Lihat posisi tombol'}
        </button>
      </section>

      {showLocation && (
        <section className="guide-location-block">
          <div className="guide-section-heading">
            <div>
              <p className="guide-step-label">2 · LIHAT POSISI TOMBOL</p>
              <h3>Temukan tombol ini pada aplikasi</h3>
            </div>
            <span>spotlight + tap</span>
          </div>
          <GuideScreen scene={feature.id} mode="locate" />
          <p className="guide-route"><strong>Cara membukanya:</strong> {feature.route}</p>
        </section>
      )}

      <section className="guide-explain-grid">
        <div>
          <p className="guide-step-label">3 · FUNGSI</p>
          <h3>Apa fungsinya?</h3>
          <p>{feature.purpose}</p>
        </div>
        <div>
          <p className="guide-step-label">4 · CARA PAKAI</p>
          <h3>Ikuti urutan ini</h3>
          <ol>
            {feature.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}
          </ol>
        </div>
      </section>

      <section className="guide-demo-block">
        <div className="guide-section-heading">
          <div>
            <p className="guide-step-label">DEMO</p>
            <h3>Lihat cara fitur bekerja</h3>
          </div>
          <span>animasi singkat</span>
        </div>
        <GuideScreen scene={feature.id} mode="demo" />
      </section>

      <section className="guide-result">
        <CheckCircle2 />
        <div>
          <p className="guide-step-label">5 · HASIL</p>
          <strong>{feature.result}</strong>
        </div>
      </section>
    </article>
  )
}

function GuideScreen({ scene, mode }: { scene: GuideScene; mode: 'locate' | 'demo' }) {
  const [navPulse, setNavPulse] = useState(0)
  const [voicePhase, setVoicePhase] = useState(0)

  useEffect(() => {
    if (scene !== 'navigation' || mode !== 'locate') return
    const timer = window.setInterval(() => setNavPulse((value) => (value + 1) % 5), 1300)
    return () => window.clearInterval(timer)
  }, [mode, scene])

  useEffect(() => {
    if (scene !== 'voice' || mode !== 'demo') return
    const timer = window.setInterval(() => setVoicePhase((value) => (value + 1) % 4), 1500)
    return () => window.clearInterval(timer)
  }, [mode, scene])

  const content = useMemo(() => {
    if (scene === 'scanner' && mode === 'demo') return <ScannerDemo />
    if (scene === 'transaction' && mode === 'demo') return <TransactionDemo />
    if (scene === 'print' && mode === 'demo') return <PrintDemo />
    if (scene === 'voice' && mode === 'demo') return <VoiceDemo phase={voicePhase} />
    if (scene === 'reports' && mode === 'demo') return <ReportsHubPreview />
    if (scene === 'settings' && mode === 'demo') return <SettingsPreview highlight="guide" annotate={false} />
    if (scene === 'products' && mode === 'demo') return <ProductsPreview target="product-actions" />
    if (scene === 'chart') return <DashboardPreview target="chart" annotate={mode === 'locate'} />
    if (scene === 'dashboard') return <DashboardPreview target={mode === 'locate' ? 'home' : 'summary'} />
    if (scene === 'search') return <ProductsPreview target="search" annotate={mode === 'locate'} />
    if (scene === 'scanner') return <ProductsPreview target="scanner" annotate={mode === 'locate'} />
    if (scene === 'products') return <ProductsPreview target={mode === 'locate' ? 'products-nav' : 'product-actions'} />
    if (scene === 'transaction') return <DashboardPreview target="transactions" />
    if (scene === 'reports') return <DashboardPreview target="reports-nav" />
    if (scene === 'print') return <TransactionDemo locatePrint />
    if (scene === 'voice') return <DashboardPreview target="voice-nav" />
    if (scene === 'settings') return <DashboardPreview target="settings-nav" />
    return <DashboardPreview target="navigation" navPulse={navPulse} />
  }, [mode, navPulse, scene, voicePhase])

  return <div className="guide-screen-stage">{content}</div>
}

type NavTarget = 'navigation' | 'home' | 'products-nav' | 'reports-nav' | 'voice-nav' | 'settings-nav' | 'none'

function PhoneFrame({
  children,
  target = 'none',
  navPulse = 0,
  annotate = true,
}: {
  children: ReactNode
  target?: NavTarget
  navPulse?: number
  annotate?: boolean
}) {
  const navItems = [
    { label: 'Home', icon: Home, key: 'home' as const },
    { label: 'Barang', icon: Package, key: 'products-nav' as const },
    { label: 'Voice AI', icon: Mic, key: 'voice-nav' as const, voice: true },
    { label: 'Laporan', icon: TrendingUp, key: 'reports-nav' as const },
    { label: 'Setelan', icon: Settings, key: 'settings-nav' as const },
  ]

  return (
    <div className="guide-phone">
      <div className="guide-phone-status"><span>09.41</span><span>● Wi-Fi ▰</span></div>
      <div className="guide-phone-body">{children}</div>
      <div className="guide-phone-nav">
        {navItems.map((item, index) => {
          const Icon = item.icon
          const highlighted = target === item.key || (target === 'navigation' && navPulse === index)
          return (
            <div
              key={item.label}
              className={cn('guide-phone-nav-item', item.voice && 'is-voice', highlighted && 'guide-spotlight')}
              data-guide-spotlight={annotate && highlighted ? item.key : undefined}
            >
              <span><Icon /></span>
              <small>{item.label}</small>
              {highlighted && <TapIndicator />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DashboardPreview({
  target,
  navPulse = 0,
  annotate = true,
}: {
  target: 'navigation' | 'home' | 'summary' | 'chart' | 'transactions' | 'reports-nav' | 'voice-nav' | 'settings-nav'
  navPulse?: number
  annotate?: boolean
}) {
  const navTarget: NavTarget = ['navigation', 'home', 'reports-nav', 'voice-nav', 'settings-nav'].includes(target)
    ? target as NavTarget
    : 'home'

  return (
    <PhoneFrame target={navTarget} navPulse={navPulse} annotate={annotate}>
      <div className="guide-mini-heading"><div><strong>Ringkasan toko</strong><small>Senin, 14 September</small></div><span>Hari ini</span></div>
      <div className={cn('guide-revenue-card', target === 'summary' && 'guide-spotlight')} data-guide-spotlight={annotate && target === 'summary' ? 'summary' : undefined}>
        <small>Pendapatan hari ini</small><strong>Rp 2.450.000</strong><span><TrendingUp /> +8,2% dibanding kemarin</span>
      </div>
      <div className="guide-metrics">
        <div><Package /><span>Produk</span><strong>128</strong></div>
        <div><CreditCard /><span>Transaksi</span><strong>24</strong></div>
        <div><Bell /><span>Stok rendah</span><strong>5</strong></div>
      </div>
      <div className={cn('guide-quick-actions', target === 'transactions' && 'guide-spotlight')} data-guide-spotlight={annotate && target === 'transactions' ? 'transactions' : undefined}>
        <div><span className="incoming"><PackagePlus /></span><small>Masuk</small></div>
        <div><span className="outgoing"><PackageMinus /></span><small>Keluar</small></div>
        <div><span><ScanLine /></span><small>Scan</small></div>
        <div><span><Package /></span><small>Tambah</small></div>
        {target === 'transactions' && <TapIndicator />}
      </div>
      <div className={cn('guide-chart-card', target === 'chart' && 'guide-spotlight')} data-guide-spotlight={annotate && target === 'chart' ? 'chart' : undefined}>
        <div><strong>Pendapatan 7 hari</strong><small>Detail</small></div>
        <b>Rp 8.720.000</b>
        <div className="guide-bars">{[42, 58, 35, 76, 54, 88, 66].map((height, index) => <i key={index} style={{ '--guide-bar': `${height}%` } as CSSProperties} />)}</div>
        {target === 'chart' && <TapIndicator />}
      </div>
    </PhoneFrame>
  )
}

function ProductsPreview({ target, annotate = true }: { target: 'search' | 'scanner' | 'products-nav' | 'product-actions'; annotate?: boolean }) {
  return (
    <PhoneFrame target={target === 'products-nav' ? 'products-nav' : 'products-nav'} annotate={annotate}>
      <div className="guide-mini-heading"><div><strong>Data barang</strong><small>Cari cepat, kelola lebih mudah.</small></div><span>+</span></div>
      <div
        className={cn('guide-search-preview', target === 'search' && 'guide-spotlight')}
        data-guide-spotlight={annotate && target === 'search' ? 'search' : undefined}
      >
        <Search />
        <span className={target === 'search' ? 'guide-type-text' : ''}>Nama, merek, atau barcode</span>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className={cn(target === 'scanner' && 'guide-inner-target guide-spotlight')}
          data-guide-spotlight={annotate && target === 'scanner' ? 'scanner' : undefined}
        >
          <ScanLine />
          {target === 'scanner' && <TapIndicator />}
        </button>
        {target === 'search' && <TapIndicator />}
      </div>
      <div className="guide-filter-preview"><span>Semua</span><span>Stok rendah</span><span>Habis</span></div>
      <p className="guide-count-preview">128 dari 128 produk</p>
      <div className="guide-product-card">
        <div><span><Package /></span><div><strong>Charger Samsung 25W</strong><small>Samsung · 8991234567890</small></div></div>
        <div><strong>Rp 249.000</strong><span>Aman · 18 unit</span></div>
        <div className={cn(target === 'product-actions' && 'guide-spotlight')} data-guide-spotlight={annotate && target === 'product-actions' ? 'product-actions' : undefined}>
          <button type="button" tabIndex={-1}><PackagePlus /> Masuk</button>
          <button type="button" tabIndex={-1}><PackageMinus /> Keluar</button>
          {target === 'product-actions' && <TapIndicator />}
        </div>
      </div>
    </PhoneFrame>
  )
}

function ScannerDemo() {
  return (
    <div className="guide-demo-card guide-scanner-demo">
      <div className="guide-demo-title"><ScanLine /><div><strong>Scanner Barcode</strong><small>Arahkan kamera ke barcode</small></div></div>
      <div className="guide-camera">
        <div className="guide-scan-corners" />
        <div className="guide-scan-line" />
        <div className="guide-barcode"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
      </div>
      <div className="guide-detected"><CheckCircle2 /><div><small>Produk ditemukan</small><strong>Charger Samsung 25W</strong></div></div>
    </div>
  )
}

function TransactionDemo({ locatePrint = false }: { locatePrint?: boolean }) {
  if (locatePrint) {
    return (
      <div className="guide-demo-card">
        <div className="guide-demo-title"><CheckCircle2 /><div><strong>Transaksi selesai</strong><small>Stok dan history sudah diperbarui</small></div></div>
        <div className="guide-result-buttons">
          <button type="button" tabIndex={-1}><FileText /> Lihat Resi</button>
          <button type="button" tabIndex={-1} className="guide-spotlight" data-guide-spotlight="print"><Printer /> Print<TapIndicator /></button>
          <button type="button" tabIndex={-1}>Oke</button>
        </div>
      </div>
    )
  }

  return (
    <div className="guide-demo-card">
      <div className="guide-demo-title"><PackagePlus /><div><strong>Keranjang Transaksi</strong><small>1 item aktif</small></div></div>
      <div className="guide-cart-row"><div><strong>Charger Samsung 25W</strong><small>Stok 18 · Rp 249.000</small></div><span>Qty 10</span></div>
      <div className="guide-transaction-kind"><small>Jenis transaksi</small><strong>Barang Masuk (Restock)</strong></div>
      <button type="button" tabIndex={-1} className="guide-process-button guide-spotlight" data-guide-spotlight="process"><CreditCard /> Proses<TapIndicator /></button>
      <p className="guide-note">“Proses” adalah tombol finalisasi/Proceed pada UI produksi.</p>
    </div>
  )
}

function ReportsHubPreview() {
  return (
    <PhoneFrame target="reports-nav">
      <div className="guide-mini-heading"><div><strong>Laporan</strong><small>Kenali ritme tokomu.</small></div></div>
      <div className="guide-report-revenue"><small>Pendapatan bulan ini</small><strong>Rp 32.850.000</strong></div>
      <div className="guide-report-list">
        <div className="guide-spotlight" data-guide-spotlight="revenue-report"><TrendingUp /><span><strong>Pendapatan</strong><small>Harian, mingguan, bulanan, tahunan</small></span><ChevronRight /><TapIndicator /></div>
        <div><PackagePlus /><span><strong>Barang masuk</strong><small>Restock & penambahan stok</small></span><ChevronRight /></div>
        <div><PackageMinus /><span><strong>Barang keluar</strong><small>Penjualan & pengurangan stok</small></span><ChevronRight /></div>
        <div><PackageCheck /><span><strong>Stok barang</strong><small>Stok terkini & nilai persediaan</small></span><ChevronRight /></div>
      </div>
    </PhoneFrame>
  )
}

function PrintDemo() {
  return (
    <div className="guide-demo-card">
      <div className="guide-demo-title"><FileText /><div><strong>Resi Digital</strong><small>Setelah transaksi selesai</small></div></div>
      <div className="guide-receipt-paper">
        <strong>ABElektronik</strong><span>Charger Samsung 25W × 1</span><b>Rp 249.000</b>
      </div>
      <div className="guide-result-buttons">
        <button type="button" tabIndex={-1} className="guide-spotlight" data-guide-spotlight="pdf"><FileText /> Save PDF<TapIndicator /></button>
        <button type="button" tabIndex={-1}><Printer /> Print Resi</button>
      </div>
      <p className="guide-note">Pada halaman laporan, gunakan tombol FileText “Simpan PDF”.</p>
    </div>
  )
}

function VoiceDemo({ phase }: { phase: number }) {
  const labels = ['Mendengarkan...', 'Memahami perintah...', 'Periksa dan konfirmasi', 'Berhasil']
  return (
    <div className="guide-demo-card guide-voice-demo">
      <div className="guide-demo-title"><Mic /><div><strong>Voice AI</strong><small>{labels[phase]}</small></div></div>
      <div className={cn('guide-voice-orb', phase === 0 && 'is-listening')}><Mic /></div>
      <p className="guide-transcript">“Barang masuk Charger Samsung 10”</p>
      {phase >= 1 && (
        <div className="guide-voice-review">
          <div><small>Produk</small><strong>Charger Samsung 25W</strong></div>
          <div><small>Jenis</small><strong>Barang Masuk</strong></div>
          <div><small>Qty</small><strong>10</strong></div>
        </div>
      )}
      {phase >= 2 && phase < 3 && (
        <button type="button" tabIndex={-1} className="guide-confirm-button guide-spotlight" data-guide-spotlight="voice-confirm">
          <CheckCircle2 /> Konfirmasi<TapIndicator />
        </button>
      )}
      {phase === 3 && <div className="guide-detected"><CheckCircle2 /><strong>Stok dan history berhasil diperbarui.</strong></div>}
    </div>
  )
}

function SettingsPreview({ highlight, annotate = true }: { highlight: 'guide'; annotate?: boolean }) {
  return (
    <PhoneFrame target="settings-nav" annotate={annotate}>
      <div className="guide-mini-heading"><div><strong>Pengaturan</strong><small>Sesuai cara kamu kerja.</small></div></div>
      <p className="guide-mini-label">TAMPILAN</p>
      <div className="guide-theme-preview"><span><Sun /> Terang</span><span><Moon /> Gelap</span></div>
      <p className="guide-mini-label">PREFERENSI TOKO</p>
      <div className="guide-settings-list">
        <div><Bell /><span><strong>Notifikasi Android</strong><small>Ringkasan stok di panel notifikasi</small></span><ChevronRight /></div>
        <div><UserCog /><span><strong>Pengaturan akun</strong><small>Email & kata sandi</small></span><ChevronRight /></div>
        <div className={cn(highlight === 'guide' && 'guide-spotlight')} data-guide-spotlight={annotate ? 'guide-menu' : undefined}>
          <BookOpen /><span><strong>Panduan Penggunaan</strong><small>Tur visual fitur dan tombol aplikasi</small></span><ChevronRight />{highlight === 'guide' && <TapIndicator />}
        </div>
      </div>
    </PhoneFrame>
  )
}

function TapIndicator() {
  return <span className="guide-tap-indicator" aria-hidden="true"><i /></span>
}
