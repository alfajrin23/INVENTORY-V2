import { ArrowRight, BarChart3, PackageCheck, PackageMinus, PackagePlus } from 'lucide-react'
import { Link } from 'react-router-dom'

import { GlassPanel } from '@/components/shared/glass-panel'
import { routes } from '@/lib/navigation'
import { cn } from '@/lib/utils'

const reportCards = [
  {
    title: 'Laporan Barang Masuk',
    detail: 'Restock dan penambahan stok',
    path: routes.incomingReport,
    icon: PackagePlus,
    accent: 'emerald',
  },
  {
    title: 'Laporan Barang Keluar',
    detail: 'Penjualan dan pengurangan stok',
    path: routes.outgoingReport,
    icon: PackageMinus,
    accent: 'amber',
  },
  {
    title: 'Laporan Stok Barang',
    detail: 'Stok terkini dan nilai persediaan',
    path: routes.stockReport,
    icon: PackageCheck,
    accent: 'cyan',
  },
  {
    title: 'Pendapatan Harian',
    detail: 'Harian, mingguan, bulanan, tahunan',
    path: routes.revenueDay,
    icon: BarChart3,
    accent: 'violet',
  },
  { title: 'Pendapatan Mingguan', detail: 'Ringkasan per minggu', path: routes.revenueWeek, icon: BarChart3, accent: 'violet' },
  { title: 'Pendapatan Bulanan', detail: 'Ringkasan per bulan', path: routes.revenueMonth, icon: BarChart3, accent: 'amber' },
  { title: 'Pendapatan Tahunan', detail: 'Ringkasan per tahun', path: routes.revenueYear, icon: BarChart3, accent: 'cyan' },
] as const

export function ReportsHubPage() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-cyan-100/70">Report Center</p>
        <h1 className="mt-1 text-3xl font-bold text-white lg:text-4xl">Laporan Data Toko</h1>
      </div>

      <section className="report-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {reportCards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.path} to={card.path}>
              <GlassPanel
                glow={card.accent}
                className="group min-h-52 p-5 transition duration-300 hover:-translate-y-1"
              >
                <div
                  className={cn(
                    'flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br shadow-inner',
                    card.accent === 'emerald' && 'from-emerald-300/28 to-teal-500/10 text-emerald-100',
                    card.accent === 'amber' && 'from-amber-300/30 to-orange-500/10 text-amber-100',
                    card.accent === 'cyan' && 'from-cyan-300/28 to-sky-500/10 text-cyan-100',
                    card.accent === 'violet' && 'from-violet-300/28 to-fuchsia-500/10 text-violet-100',
                  )}
                >
                  <Icon className="size-6 transition group-hover:rotate-6 group-hover:scale-110" />
                </div>
                <h2 className="mt-5 text-xl font-semibold text-white">{card.title}</h2>
                <p className="mt-2 min-h-10 text-sm text-white/56">{card.detail}</p>
                <div className="report-link mt-6 inline-flex items-center gap-2 text-sm font-medium text-cyan-100">
                  Buka laporan
                  <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                </div>
              </GlassPanel>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
