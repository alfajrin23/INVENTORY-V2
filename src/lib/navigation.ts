import {
  BarChart3,
  ClipboardList,
  History,
  Home,
  Package,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Settings,
  ShoppingCart,
  Store,
  TrendingUp,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

export type NavigationItem = {
  label: string
  path: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  group: 'utama' | 'laporan'
}

export const routes = {
  dashboard: '/',
  products: '/databarang.html',
  history: '/history.html',
  reports: '/laporan.html',
  incomingReport: '/laporanbarangmasuk.html',
  outgoingReport: '/laporanbarangkeluar.html',
  stockReport: '/laporanstokbarang.html',
  revenueYear: '/laporanpendapatan.html',
  revenueDay: '/pendapatanharian.html',
  revenueWeek: '/pendapatanmingguan.html',
  revenueMonth: '/pendapatanbulanan.html',
  shopping: '/belanja.html',
  updates: '/pembaruan.html',
  settings: '/pengaturan.html',
  logsInput: '/logsinput.html',
  profile: '/profilsetting.html',
}

export const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', path: routes.dashboard, icon: Home, group: 'utama' },
  { label: 'Data Barang', path: routes.products, icon: Package, group: 'utama' },
  { label: 'History Barang', path: routes.history, icon: History, group: 'utama' },
  { label: 'Laporan', path: routes.reports, icon: ClipboardList, group: 'utama' },
  { label: 'Pengaturan', path: routes.settings, icon: Settings, group: 'utama' },
  { label: 'Barang Masuk', path: routes.incomingReport, icon: PackagePlus, group: 'laporan' },
  { label: 'Barang Keluar', path: routes.outgoingReport, icon: PackageMinus, group: 'laporan' },
  { label: 'Stok Barang', path: routes.stockReport, icon: PackageCheck, group: 'laporan' },
  { label: 'Pendapatan', path: routes.revenueYear, icon: BarChart3, group: 'laporan' },
  { label: 'Belanja', path: routes.shopping, icon: ShoppingCart, group: 'laporan' },
]

export const mobileNavigation = [
  { label: 'Home', path: routes.dashboard, icon: Home },
  { label: 'Barang', path: routes.products, icon: Package },
  { label: 'Laporan', path: routes.reports, icon: TrendingUp },
  { label: 'Setelan', path: routes.settings, icon: Settings },
]

export const storeIcon = Store
