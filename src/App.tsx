import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthGate } from '@/components/auth-gate'
import { AppShell } from '@/components/layout/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InventoryProvider } from '@/hooks/use-inventory'
import { ToastProvider } from '@/hooks/use-toast'
import { routes } from '@/lib/navigation'

const loadDashboardPage = () => import('@/pages/dashboard-page')
const loadProductsPage = () => import('@/pages/products-page')
const loadHistoryPage = () => import('@/pages/history-page')
const loadReportsHubPage = () => import('@/pages/reports-hub-page')
const loadSettingsPage = () => import('@/pages/settings-page')
const loadProfileSettingsPage = () => import('@/pages/profile-settings-page')
const loadReportPages = () => import('@/pages/report-pages')

const DashboardPage = lazy(() => loadDashboardPage().then((module) => ({ default: module.DashboardPage })))
const ProductsPage = lazy(() => loadProductsPage().then((module) => ({ default: module.ProductsPage })))
const HistoryPage = lazy(() => loadHistoryPage().then((module) => ({ default: module.HistoryPage })))
const ReportsHubPage = lazy(() => loadReportsHubPage().then((module) => ({ default: module.ReportsHubPage })))
const SettingsPage = lazy(() => loadSettingsPage().then((module) => ({ default: module.SettingsPage })))
const ProfileSettingsPage = lazy(() =>
  loadProfileSettingsPage().then((module) => ({ default: module.ProfileSettingsPage })),
)
const IncomingReportPage = lazy(() => loadReportPages().then((module) => ({ default: module.IncomingReportPage })))
const OutgoingReportPage = lazy(() => loadReportPages().then((module) => ({ default: module.OutgoingReportPage })))
const StockReportPage = lazy(() => loadReportPages().then((module) => ({ default: module.StockReportPage })))
const RevenueAnnualPage = lazy(() => loadReportPages().then((module) => ({ default: module.RevenueAnnualPage })))
const RevenueDailyPage = lazy(() => loadReportPages().then((module) => ({ default: module.RevenueDailyPage })))
const RevenueWeeklyPage = lazy(() => loadReportPages().then((module) => ({ default: module.RevenueWeeklyPage })))
const RevenueMonthlyPage = lazy(() => loadReportPages().then((module) => ({ default: module.RevenueMonthlyPage })))

type NetworkInformation = { saveData?: boolean; effectiveType?: string }
type NavigatorWithConnection = Navigator & { connection?: NetworkInformation }
type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

function RoutePreloader() {
  useEffect(() => {
    const connection = (navigator as NavigatorWithConnection).connection
    if (connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return

    const preload = () => {
      void Promise.allSettled([
        loadProductsPage(),
        loadHistoryPage(),
        loadReportsHubPage(),
      ])
    }

    const idleWindow = window as IdleWindow
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(preload, { timeout: 1800 })
      return () => idleWindow.cancelIdleCallback?.(handle)
    }

    const timer = window.setTimeout(preload, 900)
    return () => window.clearTimeout(timer)
  }, [])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <ToastProvider>
          <AuthGate><InventoryProvider>
            <RoutePreloader />
            <Suspense fallback={<div className="p-6 text-sm text-white/60">Memuat halaman...</div>}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="/index.html" element={<DashboardPage />} />
                  <Route path={routes.products} element={<ProductsPage />} />
                  <Route path={routes.history} element={<HistoryPage />} />
                  <Route path={routes.reports} element={<ReportsHubPage />} />
                  <Route path={routes.incomingReport} element={<IncomingReportPage />} />
                  <Route path={routes.outgoingReport} element={<OutgoingReportPage />} />
                  <Route path={routes.stockReport} element={<StockReportPage />} />
                  <Route path={routes.revenueYear} element={<RevenueAnnualPage />} />
                  <Route path={routes.revenueDay} element={<RevenueDailyPage />} />
                  <Route path={routes.revenueWeek} element={<RevenueWeeklyPage />} />
                  <Route path={routes.revenueMonth} element={<RevenueMonthlyPage />} />
                  <Route path={routes.settings} element={<SettingsPage />} />
                  <Route path={routes.profile} element={<ProfileSettingsPage />} />
                  <Route path="*" element={<Navigate to={routes.dashboard} replace />} />
                </Route>
              </Routes>
            </Suspense>
          </InventoryProvider></AuthGate>
        </ToastProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}

export default App
