import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Mic,
  PackageMinus,
  PackagePlus,
  PencilLine,
  PlusCircle,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'

type VoiceGuidePageProps = {
  onBack: () => void
  onOpenFullGuide: () => void
}

const keywordGroups = [
  {
    title: 'Transaksi / Barang Keluar',
    icon: PackageMinus,
    detail: 'Gunakan untuk penjualan atau pengurangan stok.',
    keywords: ['transaksi', 'jual', 'penjualan', 'barang keluar', 'keluar'],
    examples: [
      'Transaksi lampu 11 watt Provi dua',
      'Jual Charger Anker 3',
      'Barang keluar Speaker JBL satu',
    ],
  },
  {
    title: 'Barang Masuk',
    icon: PackagePlus,
    detail: 'Gunakan untuk restock atau penambahan stok.',
    keywords: ['barang masuk', 'masuk', 'restok', 'stok masuk', 'tambah stok', 'masukkan stok'],
    examples: [
      'Barang masuk lampu 11 watt Provi 10',
      'Restok Charger Anker lima',
      'Tambah stok Kabel Vention 20',
    ],
  },
  {
    title: 'Tambah Barang Baru',
    icon: PlusCircle,
    detail: 'Gunakan untuk membuat produk baru dari Voice AI.',
    keywords: ['tambah barang', 'produk baru', 'nama', 'merek', 'brand', 'stok', 'qty', 'harga', 'barcode'],
    examples: [
      'Tambah barang nama Kabel HDMI merek Vivan stok 12 harga 35000 barcode 899123',
      'Tambah produk baru Lampu Meja stok 20 barcode 778899',
    ],
  },
  {
    title: 'Koreksi Hasil Voice',
    icon: PencilLine,
    detail: 'Gunakan jika hasil barang atau qty yang terbaca kurang tepat.',
    keywords: ['qty', 'jumlah', 'bukan', 'maksud saya', 'ganti ke', 'batal', 'ulang'],
    examples: [
      'Qty nya tiga',
      'Bukan Provi maksud saya Philips',
      'Batal',
      'Ulang',
    ],
  },
] as const

export function VoiceGuidePage({ onBack, onOpenFullGuide }: VoiceGuidePageProps) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-10">
      <header className="rounded-3xl border border-emerald-300/15 bg-gradient-to-br from-emerald-300/12 via-cyan-300/8 to-transparent p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Panduan Voice AI</p>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-white sm:text-3xl">
              <Mic className="size-7 text-emerald-300" /> Cara memakai Voice AI
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">
              Mulai dengan kata kunci, sebutkan nama barang, lalu jumlah. Setelah suara diproses, periksa hasil barang, jenis transaksi, dan qty sebelum menekan Konfirmasi.
            </p>
          </div>
          <Button type="button" variant="outline" size="icon" aria-label="Kembali ke Pengaturan" onClick={onBack} className="shrink-0 border-white/12 bg-white/[0.06]">
            <ArrowLeft className="size-4" />
          </Button>
        </div>
      </header>

      <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-300/12 text-emerald-200"><Sparkles className="size-5" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-white/42">Alur singkat</p>
            <h2 className="text-lg font-semibold text-white">Mic → Ucapkan → Cek hasil → Konfirmasi</h2>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {['Tekan Mic', 'Ucapkan perintah', 'Periksa hasil', 'Konfirmasi'].map((label, index) => (
            <div key={label} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/10 p-3 sm:block">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-300/15 text-xs font-bold text-emerald-100">{index + 1}</span>
              <strong className="text-sm text-white sm:mt-2 sm:block">{label}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">Kata Kunci Voice AI</p>
          <h2 className="mt-1 text-xl font-bold text-white">Kalimat yang dikenali aplikasi</h2>
          <p className="mt-1 text-sm text-white/55">Tidak harus persis sama, tetapi gunakan salah satu kata kunci agar jenis perintah terbaca jelas.</p>
        </div>

        {keywordGroups.map(group => {
          const Icon = group.icon
          return (
            <article key={group.title} className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-100"><Icon className="size-5" /></span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-white">{group.title}</h3>
                  <p className="mt-1 text-sm text-white/55">{group.detail}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2" aria-label={`Kata kunci ${group.title}`}>
                {group.keywords.map(keyword => (
                  <span key={keyword} className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-100">{keyword}</span>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-white/40">Contoh kalimat</p>
                {group.examples.map(example => (
                  <div key={example} className="flex items-start gap-2 rounded-2xl bg-black/15 px-3 py-3 text-sm text-white/82">
                    <Mic className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                    <span>“{example}”</span>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </section>

      <section className="rounded-3xl border border-emerald-300/15 bg-emerald-300/[0.07] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" />
          <div>
            <h2 className="font-semibold text-white">Bagaimana hasil pencocokan barang bekerja?</h2>
            <p className="mt-1 text-sm leading-6 text-white/62">
              Jika nama yang Anda ucapkan cocok penuh dengan satu produk, Voice AI langsung menampilkan produk tersebut sebagai <strong className="text-emerald-100">100% cocok</strong>. Daftar barang mirip tidak memenuhi layar. Jika hasilnya meleset, tekan <strong className="text-cyan-100">Bukan barang ini? Pilih data lain</strong> untuk melihat kandidat terdekat.
            </p>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={onOpenFullGuide}
        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 text-left text-white transition hover:bg-white/[0.08]"
      >
        <span className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-100"><BookOpen className="size-5" /></span>
          <span><strong className="block">Buka Panduan Lengkap</strong><small className="text-white/50">Dashboard, scanner, transaksi, laporan, PDF, settings, dan fitur lain.</small></span>
        </span>
        <ChevronRight className="size-5 text-white/35" />
      </button>
    </div>
  )
}
